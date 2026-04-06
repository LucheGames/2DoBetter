"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ListData, Task } from "../types";
import TaskRow from "./TaskRow";
import HoldToDelete from "./HoldToDelete";
import { MoveTaskButton, MoveProjectButton } from "./MoveMenu";

type DragHandleProps = React.HTMLAttributes<HTMLButtonElement>;

type ListCardProps = {
  list: ListData;
  onRefresh: () => void;
  dragHandleProps?: DragHandleProps;
};

let taskIdCounter = -1;

function GripIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

/** Sortable wrapper for a single task row */
function SortableTaskRow({
  task,
  onToggle,
  onSave,
  moveButton,
  activeSpinner,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onSave: (id: number, title: string) => void;
  moveButton?: React.ReactNode;
  activeSpinner?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: "relative",
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <TaskRow
        task={task}
        onToggle={onToggle}
        onSave={onSave}
        moveButton={moveButton}
        activeSpinner={activeSpinner}
        dragHandle={
          <button
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-700 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity touch-none p-1"
            {...(attributes as DragHandleProps)}
            {...(listeners as DragHandleProps)}
            tabIndex={-1}
            title="Drag to reorder"
          >
            <GripIcon className="w-3 h-3" />
          </button>
        }
      />
    </div>
  );
}

/** Custom hook: manages local sort order for a list of tasks */
function useTaskDnd(tasks: Task[], onRefresh: () => void) {
  const taskIdsStr = tasks.map((t) => t.id).join(",");
  const [taskIds, setTaskIds] = useState<number[]>(() => tasks.map((t) => t.id));

  // Re-sync when the underlying task list changes (after API refresh)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTaskIds(tasks.map((t) => t.id)); }, [taskIdsStr]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = taskIds.indexOf(Number(active.id));
    const newIndex = taskIds.indexOf(Number(over.id));
    const newIds = arrayMove(taskIds, oldIndex, newIndex);
    setTaskIds(newIds);
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: newIds }),
    });
  }

  return { taskIds, sensors, handleDragEnd };
}

const DISPATCH_ACTIVE_LIST = 'Active';

export default function ListCard({ list, onRefresh, dragHandleProps }: ListCardProps) {
  const isDispatchActive = list.name === DISPATCH_ACTIVE_LIST;
  const [isExpanded, setIsExpanded] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(list.name);
  const [optimisticTasks, setOptimisticTasks] = useState<Task[]>([]);
  const submittingRef = useRef(false);
  const taskInputRef = useRef<HTMLTextAreaElement>(null);

  const realActiveTasks = list.tasks.filter((t) => !t.completed);
  const { taskIds, sensors, handleDragEnd } = useTaskDnd(realActiveTasks, onRefresh);
  const orderedActiveTasks = taskIds
    .map((id) => realActiveTasks.find((t) => t.id === id))
    .filter(Boolean) as Task[];

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || submittingRef.current) return;

    submittingRef.current = true;
    setNewTaskTitle("");
    // Reset to single line so the next entry doesn't inherit the expanded height
    if (taskInputRef.current) taskInputRef.current.style.height = "";
    const tempId = taskIdCounter--;
    const tempTask: Task = {
      id: tempId,
      listId: list.id,
      title,
      completed: false,
      completedAt: null,
      completedBreadcrumb: null,
      createdBy: null,
      order: 999,
      createdAt: new Date().toISOString(),
    };
    setOptimisticTasks((prev) => [...prev, tempTask]);
    taskInputRef.current?.focus();

    try {
      await fetch(`/api/lists/${list.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } finally {
      setOptimisticTasks((prev) => prev.filter((t) => t.id !== tempId));
      submittingRef.current = false;
    }
  }

  function openTaskInput() {
    setShowTaskInput(true);
    setTimeout(() => taskInputRef.current?.focus(), 0);
  }

  function cancelTaskInput() {
    if (!newTaskTitle.trim()) {
      setShowTaskInput(false);
      setNewTaskTitle("");
    }
  }

  async function toggleTask(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
  }

  async function saveTaskTitle(id: number, title: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  async function saveListName() {
    if (!nameValue.trim()) return;
    await fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setEditingName(false);
  }

  async function moveTask(taskId: number, targetListId: number) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: targetListId }),
    });
  }

  async function moveProject(targetColumnId: number) {
    await fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: targetColumnId }),
    });
  }

  async function archiveList() {
    await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
  }

  const totalActive = orderedActiveTasks.length + optimisticTasks.length;

  return (
    <div className="rounded-lg bg-gray-900/50 border border-gray-800/50">
      {/* List header */}
      <div className="group flex items-center gap-0.5 px-1 py-0.5">
        {/* Drag handle */}
        {dragHandleProps && (
          <button
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-700 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity touch-none p-1"
            {...dragHandleProps}
            tabIndex={-1}
            title="Drag to reorder list"
          >
            <GripIcon className="w-3 h-3" />
          </button>
        )}

        {/* Collapse chevron — 36px tap target */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-500 hover:text-gray-300 rounded transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {editingName ? (
          <input
            className="flex-1 bg-transparent outline-none app-list-name font-medium text-gray-100 border-b border-accent-500"
            value={nameValue}
            autoFocus
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveListName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveListName();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : (
          <span
            onDoubleClick={() => {
              setEditingName(true);
              setNameValue(list.name);
            }}
            className="flex-1 app-list-name font-medium text-gray-300 select-none cursor-default"
          >
            {list.name}
          </span>
        )}

        {!editingName && (
          <div className="flex md:hidden md:group-hover:flex items-center">
            <MoveProjectButton currentColumnId={list.columnId} onMove={moveProject} />
            <HoldToDelete onConfirm={archiveList} label="Archive project?" />
          </div>
        )}

        {totalActive > 0 && !editingName && (
          <span className="text-xs text-gray-600 flex-shrink-0 px-1">{totalActive}</span>
        )}
      </div>

      {/* List content */}
      {isExpanded && (
        <div className="px-1 pb-2">
          {/* Sortable tasks */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              {orderedActiveTasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  onToggle={toggleTask}
                  onSave={saveTaskTitle}
                  activeSpinner={isDispatchActive}
                  moveButton={
                    <MoveTaskButton
                      currentListId={list.id}
                      onMove={(targetListId) => moveTask(task.id, targetListId)}
                    />
                  }
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Optimistic tasks (not sortable — replaced immediately on refresh) */}
          {optimisticTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={toggleTask}
              onSave={saveTaskTitle}
            />
          ))}

          {/* Add task: button → input */}
          {showTaskInput ? (
            <form onSubmit={createTask} className="px-2 mt-1">
              <textarea
                ref={taskInputRef}
                rows={1}
                className="w-full rounded px-2 py-1 bg-gray-800/50 app-input text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-accent-500/50 transition-colors resize-none overflow-hidden"
                placeholder="Task name..."
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={newTaskTitle}
                onChange={(e) => {
                  setNewTaskTitle(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                onBlur={cancelTaskInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    createTask(e as unknown as React.FormEvent);
                  }
                  if (e.key === "Escape") {
                    setShowTaskInput(false);
                    setNewTaskTitle("");
                  }
                }}
              />
            </form>
          ) : (
            <button
              onClick={openTaskInput}
              className="w-full text-left px-4 py-1 mt-1 app-meta text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
            >
              + Add task
            </button>
          )}


        </div>
      )}
    </div>
  );
}

