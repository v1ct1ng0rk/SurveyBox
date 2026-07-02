import { useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import { PageContainer } from '@ant-design/pro-components'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

type Contact = {
  id: string
  name: string
  email: string
  company: string
  created_at: string
}

export default function ContactsPage() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => (await api.get('/contacts')).data,
  })

  const saveMutation = useMutation({
    mutationFn: async (values: { name: string; email: string; company: string }) => {
      if (editing) {
        return api.put(`/contacts/${editing.id}`, values)
      }
      return api.post('/contacts', values)
    },
    onSuccess: () => {
      message.success(editing ? '已更新' : '已创建')
      setOpen(false)
      setEditing(null)
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(msg || '保存失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => {
      message.success('已删除')
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })

  const columns: ProColumns<Contact>[] = [
    { title: '名称', dataIndex: 'name' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '公司', dataIndex: 'company' },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      width: 180,
    },
    {
      title: '操作',
      valueType: 'option',
      render: (_, r) => [
        <a
          key="edit"
          onClick={() => {
            setEditing(r)
            form.setFieldsValue(r)
            setOpen(true)
          }}
        >
          编辑
        </a>,
        <Popconfirm key="del" title="确定删除？" onConfirm={() => deleteMutation.mutate(r.id)}>
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ]

  return (
    <PageContainer
      header={{
        title: '联系人管理',
        subTitle: '管理问卷分享对象',
        extra: [
          <Button
            key="add"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null)
              form.resetFields()
              setOpen(true)
            }}
          >
            新建联系人
          </Button>,
        ],
      }}
    >
      <ProTable<Contact>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items || []}
        search={false}
        pagination={{ pageSize: 20 }}
        toolBarRender={false}
      />

      <Modal
        title={editing ? '编辑联系人' : '新建联系人'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="company" label="公司">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
