import { useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import { PageContainer } from '@ant-design/pro-components'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { useApiError } from '../i18n/hooks'
import ActionLink from '../components/ActionLink'

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
  const { t } = useTranslation()
  const apiError = useApiError()

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
      message.success(editing ? t('contacts.updated') : t('contacts.created'))
      setOpen(false)
      setEditing(null)
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      message.error(apiError(msg, 'contacts.saveFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => {
      message.success(t('contacts.deleted'))
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })

  const columns: ProColumns<Contact>[] = [
    { title: t('common.name'), dataIndex: 'name' },
    { title: t('common.email'), dataIndex: 'email' },
    { title: t('common.company'), dataIndex: 'company' },
    {
      title: t('common.createdAt'),
      dataIndex: 'created_at',
      valueType: 'dateTime',
      width: 180,
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      render: (_, r) => (
        <div className="admin-table-actions">
          <ActionLink
            onClick={() => {
              setEditing(r)
              form.setFieldsValue(r)
              setOpen(true)
            }}
          >
            {t('common.edit')}
          </ActionLink>
          <Popconfirm title={t('contacts.confirmDelete')} onConfirm={() => deleteMutation.mutate(r.id)}>
            <ActionLink danger>{t('common.delete')}</ActionLink>
          </Popconfirm>
        </div>
      ),
    },
  ]

  return (
    <PageContainer
      header={{
        title: t('contacts.title'),
        subTitle: t('contacts.subtitle'),
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
            {t('contacts.newContact')}
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
        title={editing ? t('contacts.editContact') : t('contacts.newContact')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={t('common.email')} rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="company" label={t('common.company')}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
