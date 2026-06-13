import { useState } from 'react'
import {
  Row, Col, Card, Statistic, Table, Tag, Button, Drawer, Descriptions,
  Space, Input, Select, Timeline, Empty, Progress, Tooltip
} from 'antd'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { useTaskStore } from '../store/tasks'
import type { FailureReview, ReviewStatus } from '../types'

const { TextArea } = Input
const { Option } = Select

const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  pending: 'warning',
  resolved: 'success',
  ignored: 'default'
}

const PIE_COLORS = ['#ff4d4f', '#faad14', '#1890ff', '#52c41a', '#722ed1', '#13c2c2']

export default function FailureReviewCenter() {
  const store = useTaskStore()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [editConclusion, setEditConclusion] = useState('')
  const [editStatus, setEditStatus] = useState<ReviewStatus>('pending')
  const [editHandler, setEditHandler] = useState('')

  const filteredReviews = store.failureReviews.filter(r =>
    statusFilter === 'all' || r.status === statusFilter
  )

  const openReviewDetail = (review: FailureReview) => {
    store.selectReview(review)
    setEditConclusion(review.conclusion || '')
    setEditStatus(review.status)
    setEditHandler(review.handledBy || '')
    setDrawerOpen(true)
  }

  const handleSave = () => {
    if (store.selectedReview) {
      store.updateReview(store.selectedReview.id, {
        conclusion: editConclusion,
        status: editStatus,
        handledBy: editHandler,
      })
    }
  }

  const reviewColumns = [
    { title: '复盘ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '任务名称', dataIndex: 'taskName', key: 'taskName' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: ReviewStatus) => <Tag color={REVIEW_STATUS_COLORS[s]}>{s}</Tag>
    },
    {
      title: '失败原因', dataIndex: 'failureReason', key: 'failureReason',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ color: '#ff4d4f' }}>{text}</span>
        </Tooltip>
      )
    },
    { title: '重试次数', dataIndex: 'retries', key: 'retries', width: 90 },
    {
      title: '处理人', dataIndex: 'handledBy', key: 'handledBy', width: 100,
      render: (v: string | undefined) => v || '-'
    },
    {
      title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170,
      render: (t: number) => new Date(t).toLocaleString()
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: any, r: FailureReview) => (
        <Button size="small" type="link" onClick={() => openReviewDetail(r)}>查看</Button>
      )
    },
  ]

  const reasonPieData = store.failureSummary.reasonStats.map((item, idx) => ({
    name: item.reason.length > 20 ? item.reason.substring(0, 20) + '...' : item.reason,
    fullName: item.reason,
    value: item.count,
    fill: PIE_COLORS[idx % PIE_COLORS.length]
  }))

  const retryBarData = store.failureSummary.retryStats.map(item => ({
    retries: `${item.retries}次`,
    count: item.count
  }))

  const selectedTask = store.selectedReview
    ? store.tasks.find(t => t.id === store.selectedReview?.taskId)
    : null

  return (
    <div>
      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总失败数"
              value={store.failureSummary.totalFailures}
              valueStyle={{ color: '#ff4d4f' }}
              prefix="🔴"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理复盘"
              value={store.failureSummary.pendingReviews}
              valueStyle={{ color: '#faad14' }}
              prefix="⏳"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已解决复盘"
              value={store.failureSummary.resolvedReviews}
              valueStyle={{ color: '#52c41a' }}
              prefix="✅"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均重试次数"
              value={store.failureSummary.avgRetries.toFixed(1)}
              valueStyle={{ color: '#1890ff' }}
              prefix="🔄"
            />
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="失败原因分布">
            {reasonPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={reasonPieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {reasonPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip formatter={(value, _name, props) => [
                    `${value}次`,
                    props.payload.fullName
                  ]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="重试次数分布">
            {retryBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={retryBarData} layout="vertical">
                  <XAxis type="number" fontSize={10} />
                  <YAxis dataKey="retries" type="category" fontSize={10} width={50} />
                  <ReTooltip />
                  <Bar dataKey="count" fill="#1890ff" radius={[0, 4, 4, 0]}>
                    {retryBarData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>

      {/* Review List */}
      <Card
        title="失败复盘列表"
        extra={
          <Space>
            <span style={{ fontSize: 12, color: '#888' }}>状态筛选:</span>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 120 }}
              size="small"
            >
              <Option value="all">全部</Option>
              <Option value="pending">待处理</Option>
              <Option value="resolved">已解决</Option>
              <Option value="ignored">已忽略</Option>
            </Select>
          </Space>
        }
      >
        <Table
          dataSource={filteredReviews}
          columns={reviewColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: '暂无失败复盘记录' }}
        />
      </Card>

      {/* Review Detail Drawer */}
      <Drawer
        title="失败复盘详情"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setDrawerOpen(false)}>取消</Button>
              <Button type="primary" onClick={handleSave}>保存</Button>
            </Space>
          </div>
        }
      >
        {store.selectedReview && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="复盘ID">{store.selectedReview.id}</Descriptions.Item>
              <Descriptions.Item label="任务名称">{store.selectedReview.taskName}</Descriptions.Item>
              <Descriptions.Item label="任务ID">{store.selectedReview.taskId}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={REVIEW_STATUS_COLORS[store.selectedReview.status]}>
                  {store.selectedReview.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="失败原因">
                <span style={{ color: '#ff4d4f' }}>{store.selectedReview.failureReason}</span>
              </Descriptions.Item>
              <Descriptions.Item label="重试次数">{store.selectedReview.retries} 次</Descriptions.Item>
              <Descriptions.Item label="失败时间">
                {new Date(store.selectedReview.createdAt).toLocaleString()}
              </Descriptions.Item>
              {store.selectedReview.resolvedAt && (
                <Descriptions.Item label="解决时间">
                  {new Date(store.selectedReview.resolvedAt).toLocaleString()}
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Retry Records Timeline */}
            <h4 style={{ marginBottom: 12 }}>重试记录</h4>
            {selectedTask && selectedTask.retryRecords.length > 0 ? (
              <div style={{
                background: '#1f1f1f',
                padding: '12px 16px',
                borderRadius: 8,
                marginBottom: 16
              }}>
                <Timeline
                  size="small"
                  items={selectedTask.retryRecords.map(r => ({
                    color: r.result === 'failed' ? 'red' : 'blue',
                    children: (
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          重试 #{r.retryNo} - <Tag color={r.result === 'failed' ? 'error' : 'processing'} size="small">{r.result}</Tag>
                        </div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                          节点: {r.node} | {new Date(r.retriedAt).toLocaleString()}
                        </div>
                        {r.errorMessage && (
                          <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>
                            错误: {r.errorMessage}
                          </div>
                        )}
                      </div>
                    )
                  }))}
                />
              </div>
            ) : (
              <Empty
                description="暂无重试记录"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ marginBottom: 16 }}
              />
            )}

            {/* Edit Section */}
            <h4 style={{ marginBottom: 12 }}>处理结论</h4>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#888' }}>
                  复盘状态
                </label>
                <Select
                  value={editStatus}
                  onChange={setEditStatus}
                  style={{ width: '100%' }}
                  size="small"
                >
                  <Option value="pending">待处理</Option>
                  <Option value="resolved">已解决</Option>
                  <Option value="ignored">已忽略</Option>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#888' }}>
                  处理人
                </label>
                <Input
                  value={editHandler}
                  onChange={e => setEditHandler(e.target.value)}
                  placeholder="请输入处理人"
                  size="small"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#888' }}>
                  处理结论
                </label>
                <TextArea
                  value={editConclusion}
                  onChange={e => setEditConclusion(e.target.value)}
                  placeholder="请输入故障根因、解决方案、改进措施等..."
                  rows={5}
                />
              </div>
            </Space>
          </>
        )}
      </Drawer>
    </div>
  )
}
