export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'retry'
export type NodeType = 'scheduler' | 'worker'
export type ReviewStatus = 'pending' | 'resolved' | 'ignored'

export interface Task {
  id: string
  name: string
  status: TaskStatus
  node: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  retries: number
  maxRetries: number
  duration?: number
  logs: string[]
  failureReason?: string
  retryRecords: RetryRecord[]
  failedAt?: number
}

export interface RetryRecord {
  retryNo: number
  retriedAt: number
  node: string
  result: string
  errorMessage?: string
}

export interface FailureReview {
  id: string
  taskId: string
  taskName: string
  failureReason: string
  conclusion?: string
  status: ReviewStatus
  createdAt: number
  resolvedAt?: number
  retries: number
  handledBy?: string
}

export interface FailureSummary {
  totalFailures: number
  pendingReviews: number
  resolvedReviews: number
  avgRetries: number
  reasonStats: { reason: string; count: number }[]
  retryStats: { retries: number; count: number }[]
}

export interface ClusterNode {
  id: string
  name: string
  type: NodeType
  status: 'online' | 'offline' | 'overloaded'
  cpu: number
  memory: number
  tasks: number
  uptime: number
}

export interface MetricsSnapshot {
  time: number
  totalTasks: number
  runningTasks: number
  successRate: number
  avgLatency: number
  nodeCount: number
}
