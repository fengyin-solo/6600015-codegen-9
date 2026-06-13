defmodule Scheduler.TaskManager do
  use GenServer

  defmodule Task do
    defstruct [:id, :name, :status, :node, :created_at, :retries, :max_retries, :logs, :failure_reason, :retry_records, :failed_at]
  end

  defmodule RetryRecord do
    defstruct [:retry_no, :retried_at, :node, :result, :error_message]
  end

  defmodule FailureReview do
    defstruct [:id, :task_id, :task_name, :failure_reason, :conclusion, :status, :created_at, :resolved_at, :retries, :handled_by]
  end

  # Client API
  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def list_tasks, do: GenServer.call(__MODULE__, :list_tasks)

  def add_task(name) do
    GenServer.call(__MODULE__, {:add_task, name})
  end

  def retry_task(id), do: GenServer.call(__MODULE__, {:retry_task, id})

  def cancel_task(id), do: GenServer.call(__MODULE__, {:cancel_task, id})

  def get_stats, do: GenServer.call(__MODULE__, :get_stats)

  def list_failure_reviews, do: GenServer.call(__MODULE__, :list_failure_reviews)

  def get_failure_review(id), do: GenServer.call(__MODULE__, {:get_failure_review, id})

  def update_failure_review(id, params), do: GenServer.call(__MODULE__, {:update_failure_review, id, params})

  def get_failure_summary, do: GenServer.call(__MODULE__, :get_failure_summary)

  # Server callbacks
  @impl true
  def init(_) do
    failure_reasons = [
      "Network timeout connecting to database",
      "Insufficient memory on worker node",
      "Invalid input data format",
      "External API rate limit exceeded",
      "Disk space full on target node",
      "Authentication token expired"
    ]

    tasks = for i <- 1..12 do
      name = Enum.at(~w[data_sync email_batch report_gen cache_warm log_rotate db_backup index_rebuild health_check], rem(i - 1, 8))
      status = Enum.at(~w[pending running success failed]a, :rand.uniform(4) - 1)
      retries = if status == :failed, do: :rand.uniform(3) - 1, else: 0
      failed_at = if status == :failed, do: DateTime.utc_now() |> DateTime.add(-:rand.uniform(3600), :second), else: nil
      failure_reason = if status == :failed, do: Enum.at(failure_reasons, :rand.uniform(length(failure_reasons)) - 1), else: nil

      retry_records = for r <- 1..retries do
        %RetryRecord{
          retry_no: r,
          retried_at: DateTime.utc_now() |> DateTime.add(-:rand.uniform(1800), :second),
          node: "worker-#{:rand.uniform(4)}",
          result: :failed,
          error_message: Enum.at(failure_reasons, :rand.uniform(length(failure_reasons)) - 1)
        }
      end

      %Task{
        id: "task-#{1000 + i}",
        name: name,
        status: status,
        node: "worker-#{:rand.uniform(4)}",
        created_at: DateTime.utc_now() |> DateTime.add(-:rand.uniform(7200), :second),
        retries: retries,
        max_retries: 3,
        logs: generate_logs(name, status, retries, failure_reason),
        failure_reason: failure_reason,
        retry_records: retry_records,
        failed_at: failed_at
      }
    end

    failure_reviews = tasks
      |> Enum.filter(& &1.status == :failed)
      |> Enum.with_index()
      |> Enum.map(fn {task, idx} ->
        %FailureReview{
          id: "review-#{100 + idx}",
          task_id: task.id,
          task_name: task.name,
          failure_reason: task.failure_reason,
          conclusion: if(idx < 2, do: "已定位根因为网络抖动，已增加超时重试配置", else: nil),
          status: if(idx < 2, do: :resolved, else: :pending),
          created_at: task.failed_at || DateTime.utc_now(),
          resolved_at: if(idx < 2, do: DateTime.utc_now() |> DateTime.add(-:rand.uniform(1800), :second), else: nil),
          retries: task.retries,
          handled_by: if(idx < 2, do: "ops-admin", else: nil)
        }
      end)

    {:ok, %{tasks: tasks, counter: 1013, failure_reviews: failure_reviews, review_counter: 100 + length(failure_reviews)}}
  end

  defp generate_logs(name, status, retries, failure_reason) do
    base_logs = ["[INFO] Task #{name} created", "[INFO] Task #{name} started"]
    if status == :failed do
      retry_logs = for r <- 1..retries, do: "[WARN] Retry ##{r} failed"
      base_logs ++ retry_logs ++ ["[ERROR] #{failure_reason}"]
    else
      base_logs ++ ["[INFO] Task completed successfully"]
    end
  end

  @impl true
  def handle_call(:list_tasks, _from, state) do
    {:reply, state.tasks, state}
  end

  @impl true
  def handle_call({:add_task, name}, _from, state) do
    counter = state.counter + 1
    task = %Task{
      id: "task-#{counter}",
      name: name,
      status: :pending,
      node: "worker-#{:rand.uniform(4)}",
      created_at: DateTime.utc_now(),
      retries: 0,
      max_retries: 3,
      logs: ["[INFO] Task #{name} queued"],
      failure_reason: nil,
      retry_records: [],
      failed_at: nil
    }
    {:reply, task, %{state | tasks: [task | state.tasks], counter: counter}}
  end

  @impl true
  def handle_call({:retry_task, id}, _from, state) do
    tasks = Enum.map(state.tasks, fn
      %{id: ^id} = t ->
        retry_record = %RetryRecord{
          retry_no: t.retries + 1,
          retried_at: DateTime.utc_now(),
          node: t.node,
          result: :pending,
          error_message: nil
        }
        %{t | status: :pending, retries: t.retries + 1,
          logs: t.logs ++ ["[INFO] Retry ##{t.retries + 1} initiated"],
          retry_records: t.retry_records ++ [retry_record],
          failure_reason: nil,
          failed_at: nil}
      t -> t
    end)
    {:reply, :ok, %{state | tasks: tasks}}
  end

  @impl true
  def handle_call({:cancel_task, id}, _from, state) do
    {task, _} = Enum.find(state.tasks, {nil, nil}, fn t -> t.id == id end)
    tasks = Enum.map(state.tasks, fn
      %{id: ^id} = t ->
        %{t | status: :failed,
          logs: t.logs ++ ["[WARN] Cancelled by user"],
          failure_reason: "Cancelled by user",
          failed_at: DateTime.utc_now()}
      t -> t
    end)

    state = %{state | tasks: tasks}
    state = if task && !Enum.find(state.failure_reviews, & &1.task_id == id) do
      review_counter = state.review_counter + 1
      review = %FailureReview{
        id: "review-#{review_counter}",
        task_id: id,
        task_name: task.name,
        failure_reason: "Cancelled by user",
        conclusion: nil,
        status: :pending,
        created_at: DateTime.utc_now(),
        resolved_at: nil,
        retries: task.retries,
        handled_by: nil
      }
      %{state | failure_reviews: [review | state.failure_reviews], review_counter: review_counter}
    else
      state
    end

    {:reply, :ok, state}
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    stats = %{
      total: length(state.tasks),
      running: Enum.count(state.tasks, & &1.status == :running),
      success: Enum.count(state.tasks, & &1.status == :success),
      failed: Enum.count(state.tasks, & &1.status == :failed)
    }
    {:reply, stats, state}
  end

  @impl true
  def handle_call(:list_failure_reviews, _from, state) do
    {:reply, state.failure_reviews, state}
  end

  @impl true
  def handle_call({:get_failure_review, id}, _from, state) do
    review = Enum.find(state.failure_reviews, & &1.id == id)
    task = Enum.find(state.tasks, & &1.id == (review && review.task_id))
    {:reply, %{review: review, retry_records: task && task.retry_records || []}, state}
  end

  @impl true
  def handle_call({:update_failure_review, id, params}, _from, state) do
    reviews = Enum.map(state.failure_reviews, fn
      %{id: ^id} = r ->
        r = if Map.has_key?(params, "conclusion"), do: %{r | conclusion: params["conclusion"]}, else: r
        r = if Map.has_key?(params, "status"), do: %{r | status: String.to_atom(params["status"])}, else: r
        r = if Map.has_key?(params, "handled_by"), do: %{r | handled_by: params["handled_by"]}, else: r
        if r.status == :resolved and is_nil(r.resolved_at) do
          %{r | resolved_at: DateTime.utc_now()}
        else
          r
        end
      r -> r
    end)
    updated = Enum.find(reviews, & &1.id == id)
    {:reply, updated, %{state | failure_reviews: reviews}}
  end

  @impl true
  def handle_call(:get_failure_summary, _from, state) do
    failed_tasks = Enum.filter(state.tasks, & &1.status == :failed)

    reason_stats = failed_tasks
      |> Enum.frequencies_by(& &1.failure_reason)
      |> Enum.map(fn {reason, count} -> %{reason: reason, count: count} end)
      |> Enum.sort_by(& &1.count, :desc)

    retry_stats = failed_tasks
      |> Enum.frequencies_by(& &1.retries)
      |> Enum.map(fn {retries, count} -> %{retries: retries, count: count} end)
      |> Enum.sort_by(& &1.retries)

    summary = %{
      total_failures: length(failed_tasks),
      pending_reviews: Enum.count(state.failure_reviews, & &1.status == :pending),
      resolved_reviews: Enum.count(state.failure_reviews, & &1.status == :resolved),
      avg_retries: if length(failed_tasks) > 0, do: Enum.sum(Enum.map(failed_tasks, & &1.retries)) / length(failed_tasks), else: 0,
      reason_stats: reason_stats,
      retry_stats: retry_stats
    }
    {:reply, summary, state}
  end
end
