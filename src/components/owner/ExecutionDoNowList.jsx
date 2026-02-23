import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical, Check, Circle } from 'lucide-react';

function DraggableItem({ item, index, onToggle, onTextChange }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { index },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 rounded-lg border border-border-subtle bg-card px-2 py-2 transition-opacity ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <button
        {...listeners}
        {...attributes}
        className="p-1 text-muted hover:text-secondary cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={16} />
      </button>
      <button
        onClick={() => onToggle(item.id)}
        className="shrink-0 cursor-pointer"
      >
        {item.done ? (
          <Check size={18} className="text-brand" />
        ) : (
          <Circle size={18} className="text-muted" />
        )}
      </button>
      <input
        type="text"
        value={item.text}
        onChange={(e) => onTextChange(item.id, e.target.value)}
        placeholder={`Task ${index + 1}`}
        className={`flex-1 bg-transparent text-sm outline-none text-primary placeholder:text-muted ${
          item.done ? 'line-through text-muted' : ''
        }`}
      />
      <span className="text-xs text-muted font-mono w-4 text-center shrink-0">{index + 1}</span>
    </div>
  );
}

function DroppableSlot({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`transition-all ${isOver ? 'ring-2 ring-brand/40 rounded-lg' : ''}`}
    >
      {children}
    </div>
  );
}

export default function ExecutionDoNowList({ items, onChange }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const activeItem = items.find((i) => i.id === activeId);

  const handleToggle = (id) => {
    onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  };

  const handleTextChange = (id, text) => {
    onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onChange(reordered);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <DroppableSlot key={item.id} id={item.id}>
            <DraggableItem
              item={item}
              index={index}
              onToggle={handleToggle}
              onTextChange={handleTextChange}
            />
          </DroppableSlot>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="flex items-center gap-2 rounded-lg border-2 border-brand bg-card px-2 py-2 shadow-lg">
            <GripVertical size={16} className="text-muted" />
            {activeItem.done ? (
              <Check size={18} className="text-brand" />
            ) : (
              <Circle size={18} className="text-muted" />
            )}
            <span className={`text-sm ${activeItem.done ? 'line-through text-muted' : 'text-primary'}`}>
              {activeItem.text || 'Task'}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
