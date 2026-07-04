import type { ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { HolderOutlined } from '@ant-design/icons'
import { Card } from 'antd'
import { useTranslation } from 'react-i18next'
import type { SurveyField } from '../lib/surveyTemplate'

type SortableFieldItemProps = {
  field: SurveyField
  children: ReactNode
}

function SortableFieldItem({ field, children }: SortableFieldItemProps) {
  const { t } = useTranslation()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginBottom: 8,
    opacity: isDragging ? 0.55 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="sortable-field-item">
      <Card size="small" styles={{ body: { padding: 12 } }}>
        <div className="sortable-field-item__row">
          <button
            type="button"
            className="sortable-field-item__handle"
            aria-label={t('surveyEdit.dragHandleAria')}
            {...attributes}
            {...listeners}
          >
            <HolderOutlined />
          </button>
          <div className="sortable-field-item__content">
            {children}
          </div>
        </div>
      </Card>
    </div>
  )
}

type SortableFieldListProps = {
  fields: SurveyField[]
  onReorder: (fields: SurveyField[]) => void
  renderItem: (field: SurveyField, index: number) => ReactNode
}

export default function SortableFieldList({ fields, onReorder, renderItem }: SortableFieldListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = fields.findIndex((f) => f.id === active.id)
    const newIndex = fields.findIndex((f) => f.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    onReorder(arrayMove(fields, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        {fields.map((field, index) => (
          <SortableFieldItem key={field.id} field={field}>
            {renderItem(field, index)}
          </SortableFieldItem>
        ))}
      </SortableContext>
    </DndContext>
  )
}
