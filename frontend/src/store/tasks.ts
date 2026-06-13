import { create } from 'zustand'
import type { Task, ClusterNode, MetricsSnapshot, TaskStatus, FailureReview, FailureSummary, RetryRecord, ReviewStatus } from '../types'

const failureReasons = [
  'Network timeout connecting to database',
  'Insufficient memory on worker node',
  'Invalid input data format',
  'External API rate limit exceeded',
  'Disk space full on target node',
  'Authentication token expired'
]

// Mock data generators
function mockNodes(): ClusterNode[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `node-${i + 1}`,
    name: i === 0 ? 'scheduler-main' : `worker-${i}`,
    type: i === 0 ? 'scheduler' as const : 'worker' as const,
    status: Math.random() > 0.1 ? 'online' as const : 'overloaded' as const,
    cpu: 20 + Math.random() * 60,
    memory: 30 + Math.random() * 50,
    tasks: Math.floor(Math.random() * 8),
    uptime: 3600 + Math.floor(Math.random() * 86400),
  }))
}

function mockTasks(nodes: ClusterNode[]): Task[] {
  const names = ['data_sync', 'email_batch', 'report_gen', 'cache_warm', 'log_rotate', 'db_backup', 'index_rebuild', 'health_check']
  return Array.from({ length: 12 }, (_, i) => {
    const status: TaskStatus[] = ['pending', 'running', 'success', 'failed']
    const s = status[Math.floor(Math.random() * 4)]
    const node = nodes[Math.floor(Math.random() * nodes.length)]
    const retries = s === 'failed' ? Math.floor(Math.random() * 3) : 0
    const failureReason = s === 'failed' ? failureReasons[Math.floor(Math.random() * failureReasons.length)] : undefined
    const failedAt = s === 'failed' ? Date.now() - Math.floor(Math.random() * 3600000) : undefined

    const retryRecords: RetryRecord[] = Array.from({ length: retries }, (_, r) => ({
      retryNo: r + 1,
      retriedAt: Date.now() - Math.floor(Math.random() * 1800000),
      node: `worker-${Math.floor(Math.random() * 4) + 1}`,
      result: 'failed',
      errorMessage: failureReasons[Math.floor(Math.random() * failureReasons.length)]
    }))

    return {
      id: `task-${1000 + i}`,
      name: names[i % names.length],
      status: s,
      node: node.name,
      createdAt: Date.now() - Math.floor(Math.random() * 600000),
      startedAt: s !== 'pending' ? Date.now() - Math.floor(Math.random() * 300000) : undefined,
      completedAt: (s === 'success' || s === 'failed') ? Date.now() - Math.floor(Math.random() * 60000) : undefined,
      retries,
      maxRetries: 3,
      duration: s === 'success' ? 1000 + Math.floor(Math.random() * 30000) : undefined,
      logs: [`[INFO] Task ${names[i % names.length]} started`, `[INFO] Processing on ${node.name}`],
      failureReason,
      retryRecords,
      failedAt,
    }
  })
}

function mockFailureReviews(tasks: Task[]): FailureReview[] {
  const failedTasks = tasks.filter(t => t.status === 'failed')
  return failedTasks.map((task, idx) => ({
    id: `review-${100 + idx}`,
    taskId: task.id,
    taskName: task.name,
    failureReason: task.failureReason || 'Unknown error',
    conclusion: idx < 2 ? '已定位根因为网络抖动，已增加超时重试配置' : undefined,
    status: (idx < 2 ? 'resolved' : 'pending') as ReviewStatus,
    createdAt: task.failedAt || Date.now() - Math.floor(Math.random() * 7200000),
    resolvedAt: idx < 2 ? Date.now() - Math.floor(Math.random() * 1800000) : undefined,
    retries: task.retries,
    handledBy: idx < 2 ? 'ops-admin' : undefined,
  }))
}

function mockFailureSummary(tasks: Task[], reviews: FailureReview[]): FailureSummary {
  const failedTasks = tasks.filter(t => t.status === 'failed')
  const reasonMap = new Map<string, number>()
  failedTasks.forEach(t => {
    const reason = t.failureReason || 'Unknown'
    reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1)
  })
  const reasonStats = Array.from(reasonMap.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)

  const retryMap = new Map<number, number>()
  failedTasks.forEach(t => {
    retryMap.set(t.retries, (retryMap.get(t.retries) || 0) + 1)
  })
  const retryStats = Array.from(retryMap.entries()).map(([retries, count]) => ({ retries, count })).sort((a, b) => a.retries - b.retries)

  return {
    totalFailures: failedTasks.length,
    pendingReviews: reviews.filter(r => r.status === 'pending').length,
    resolvedReviews: reviews.filter(r => r.status === 'resolved').length,
    avgRetries: failedTasks.length > 0 ? failedTasks.reduce((sum, t) => sum + t.retries, 0) / failedTasks.length : 0,
    reasonStats,
    retryStats,
  }
}

const initialNodes = mockNodes()
const initialTasks = mockTasks(initialNodes)
const initialReviews = mockFailureReviews(initialTasks)

interface TaskStore {
  tasks: Task[]
  nodes: ClusterNode[]
  metrics: MetricsSnapshot[]
  selectedTask: Task | null
  failureReviews: FailureReview[]
  failureSummary: FailureSummary
  selectedReview: FailureReview | null
  addTask: (name: string) => void
  retryTask: (id: string) => void
  cancelTask: (id: string) => void
  selectTask: (t: Task | null) => void
  refreshNodes: () => void
  addMetric: () => void
  selectReview: (r: FailureReview | null) => void
  updateReview: (id: string, params: { conclusion?: string; status?: ReviewStatus; handledBy?: string }) => void
  refreshFailureSummary: () => void
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: initialTasks,
  nodes: initialNodes,
  metrics: Array.from({ length: 20 }, (_, i) => ({
    time: Date.now() - (20 - i) * 5000,
    totalTasks: 100 + i * 2,
    runningTasks: 3 + Math.floor(Math.random() * 5),
    successRate: 85 + Math.random() * 14,
    avgLatency: 500 + Math.random() * 2000,
    nodeCount: 5,
  })),
  selectedTask: null,
  failureReviews: initialReviews,
  failureSummary: mockFailureSummary(initialTasks, initialReviews),
  selectedReview: null,
  addTask: (name) => {
    const task: Task = {
      id: `task-${Date.now()}`,
      name, status: 'pending',
      node: get().nodes[Math.floor(Math.random() * get().nodes.length)].name,
      createdAt: Date.now(), retries: 0, maxRetries: 3,
      logs: [`[INFO] Task ${name} queued`],
      retryRecords: [],
    }
    set({ tasks: [task, ...get().tasks] })
  },
  retryTask: (id) => set({
    tasks: get().tasks.map(t => t.id === id ? {
      ...t,
      status: 'pending',
      retries: t.retries + 1,
      logs: [...t.logs, `[INFO] Retry #${t.retries + 1} initiated`],
      failureReason: undefined,
      failedAt: undefined,
      retryRecords: [...t.retryRecords, {
        retryNo: t.retries + 1,
        retriedAt: Date.now(),
        node: t.node,
        result: 'pending',
      }]
    } : t)
  }),
  cancelTask: (id) => {
    const task = get().tasks.find(t => t.id === id)
    const newTasks = get().tasks.map(t => t.id === id ? {
      ...t,
      status: 'failed' as TaskStatus,
      logs: [...t.logs, '[WARN] Cancelled by user'],
      failureReason: 'Cancelled by user',
      failedAt: Date.now(),
    } : t)

    let newReviews = get().failureReviews
    if (task && !get().failureReviews.find(r => r.taskId === id)) {
      const newReview: FailureReview = {
        id: `review-${Date.now()}`,
        taskId: id,
        taskName: task.name,
        failureReason: 'Cancelled by user',
        status: 'pending',
        createdAt: Date.now(),
        retries: task.retries,
      }
      newReviews = [newReview, ...newReviews]
    }

    set({
      tasks: newTasks,
      failureReviews: newReviews,
      failureSummary: mockFailureSummary(newTasks, newReviews),
    })
  },
  selectTask: (t) => set({ selectedTask: t }),
  refreshNodes: () => set({ nodes: mockNodes() }),
  addMetric: () => {
    const m: MetricsSnapshot = {
      time: Date.now(),
      totalTasks: get().tasks.length,
      runningTasks: get().tasks.filter(t => t.status === 'running').length,
      successRate: (get().tasks.filter(t => t.status === 'success').length / Math.max(get().tasks.length, 1)) * 100,
      avgLatency: 500 + Math.random() * 2000,
      nodeCount: get().nodes.filter(n => n.status !== 'offline').length,
    }
    set({ metrics: [...get().metrics.slice(-30), m] })
  },
  selectReview: (r) => set({ selectedReview: r }),
  updateReview: (id, params) => {
    const reviews = get().failureReviews.map(r => r.id === id ? {
      ...r,
      ...params,
      resolvedAt: params.status === 'resolved' && !r.resolvedAt ? Date.now() : r.resolvedAt,
    } : r)
    const updated = reviews.find(r => r.id === id)
    set({
      failureReviews: reviews,
      selectedReview: updated || null,
      failureSummary: mockFailureSummary(get().tasks, reviews),
    })
  },
  refreshFailureSummary: () => {
    set({ failureSummary: mockFailureSummary(get().tasks, get().failureReviews) })
  },
}))
