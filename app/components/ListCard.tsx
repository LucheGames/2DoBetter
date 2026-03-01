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
  onDelete,
  onSave,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (id: number) => void;
  onSave: (id: number, title: string) => void;
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
        onDelete={onDelete}
        onSave={onSave}
        dragHandle={
          <button
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-700 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity touch-none mt-0.5"
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
    onRefresh();
  }

  return { taskIds, sensors, handleDragEnd };
}

export default function ListCard({ list, onRefresh, dragHandleProps }: ListCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [newSubListName, setNewSubListName] = useState("");
  const [showAddSubList, setShowAddSubList] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [optimisticTasks, setOptimisticTasks] = useState<Task[]>([]);
  const submittingRef = useRef(false);
  const taskInputRef = useRef<HTMLInputElement>(null);

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
    const tempId = taskIdCounter--;
    const tempTask: Task = {
      id: tempId,
      listId: list.id,
      title,
      completed: false,
      completedAt: null,
      completedBreadcrumb: null,
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
      onRefresh();
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
    onRefresh();
  }

  async function deleteTask(id: number) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    onRefresh();
  }

  async function saveTaskTitle(id: number, title: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    onRefresh();
  }

  async function saveListName() {
    if (!nameValue.trim()) return;
    await fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setEditingName(false);
    onRefresh();
  }

  async function deleteList() {
    await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    onRefresh();
  }

  async function createSubList(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubListName.trim()) return;
    await fetch(`/api/lists/${list.id}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSubListName }),
    });
    setNewSubListName("");
    setShowAddSubList(false);
    onRefresh();
  }

  const totalActive = orderedActiveTasks.length + optimisticTasks.length;

  return (
    <div className="rounded-lg bg-gray-900/50 border border-gray-800/50">
      {/* List header */}
      <div className="group flex items-center gap-1 px-3 py-2">
        {/* Drag handle for list reordering — only rendered when parent passes props */}
        {dragHandleProps && (
          <button
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-700 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
            {...dragHandleProps}
            tabIndex={-1}
            title="Drag to reorder list"
          >
            <GripIcon className="w-3 h-3" />
          </button>
        )}

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 text-gray-500 hover:text-gray-300"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
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
            className="flex-1 bg-transparent outline-none text-sm font-medium text-gray-100 border-b border-blue-500"
            value={nameValue}
            autoFocus
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveListName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveListName();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : confirmDelete ? (
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-red-300">Delete list?</span>
            <button
              onClick={deleteList}
              className="text-xs px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            >
              No
            </button>
          </div>
        ) : (
          <span
            onDoubleClick={() => {
              setEditingName(true);
              setNameValue(list.name);
            }}
            className="flex-1 text-sm font-medium text-gray-300 select-none cursor-default"
          >
            {list.name}
          </span>
        )}

        {!editingName && !confirmDelete && (
          <div className="hidden group-hover:flex items-center gap-1">
            <button
              onClick={() => setShowAddSubList(!showAddSubList)}
              className="text-gray-600 hover:text-gray-400 text-xs px-1"
              title="Add sub-list"
            >
              +
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-gray-600 hover:text-red-400 text-xs px-1"
              title="Delete list"
            >
              ×
            </button>
          </div>
        )}

        {totalActive > 0 && !editingName && !confirmDelete && (
          <span className="text-xs text-gray-600 flex-shrink-0">{totalActive}</span>
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
                  onDelete={deleteTask}
                  onSave={saveTaskTitle}
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
              onDelete={deleteTask}
              onSave={saveTaskTitle}
            />
          ))}

          {/* Add task: button → input */}
          {showTaskInput ? (
            <form onSubmit={createTask} className="px-2 mt-1">
              <input
                ref={taskInputRef}
                className="w-full rounded px-2 py-1 bg-gray-800/50 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-500/50 transition-colors"
                placeholder="Task name..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onBlur={cancelTaskInput}
                onKeyDown={(e) => {
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
              className="w-full text-left px-4 py-1 mt-1 text-sm text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
            >
              + Add subtask
            </button>
          )}

          {/* Sub-list creation form */}
          {showAddSubList && (
            <form onSubmit={createSubList} className="px-2 mt-2">
              <input
                className="w-full rounded px-2 py-1 bg-gray-800 text-sm text-gray-300 placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Sub-list name..."
                value={newSubListName}
                autoFocus
                onChange={(e) => setNewSubListName(e.target.value)}
                onBlur={() => {
                  if (!newSubListName.trim()) {
                    setShowAddSubList(false);
                    setNewSubListName("");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowAddSubList(false);
                    setNewSubListName("");
                  }
                }}
              />
            </form>
          )}

          {/* Sub-lists */}
          {list.children.map((child) => (
            <div key={child.id} className="ml-3 mt-2 border-l-2 border-gray-800 pl-2">
              <SubList list={child} onRefresh={onRefresh} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sub-list — same task DnD as ListCard, no further nesting */
function SubList({ list, onRefresh }: { list: ListData; onRefresh: () => void }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [optimisticTasks, setOptimisticTasks] = useState<Task[]>([]);
  const submittingRef = useRef(false);
  const taskInputRef = useRef<HTMLInputElement>(null);

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
    const tempId = taskIdCounter--;
    const tempTask: Task = {
      id: tempId,
      listId: list.id,
      title,
      completed: false,
      completedAt: null,
      completedBreadcrumb: null,
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
      onRefresh();
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
    onRefresh();
  }

  async function deleteTask(id: number) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    onRefresh();
  }

  async function saveTaskTitle(id: number, title: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    onRefresh();
  }

  async function saveListName() {
    if (!nameValue.trim()) return;
    await fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setEditingName(false);
    onRefresh();
  }

  async function deleteSubList() {
    await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    onRefresh();
  }

  const totalActive = orderedActiveTasks.length + optimisticTasks.length;

  return (
    <div>
      <div className="group flex items-center gap-1 py-1">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 text-gray-600 hover:text-gray-400"
        >
          <svg
            className={`w-2.5 h-2.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
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
            className="flex-1 bg-transparent outline-none text-xs font-medium text-gray-100 border-b border-blue-500"
            value={nameValue}
            autoFocus
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveListName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveListName();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : confirmDelete ? (
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-red-300">Delete?</span>
            <button
              onClick={deleteSubList}
              className="text-xs px-1 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-1 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            >
              No
            </button>
          </div>
        ) : (
          <span
            onDoubleClick={() => {
              setEditingName(true);
              setNameValue(list.name);
            }}
            className="flex-1 text-xs font-medium text-gray-400 select-none cursor-default"
          >
            {list.name}
          </span>
        )}

        {!editingName && !confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="hidden group-hover:block text-gray-700 hover:text-red-400 text-xs px-1"
            title="Delete sub-list"
          >
            ×
          </button>
        )}

        {totalActive > 0 && !editingName && !confirmDelete && (
          <span className="text-xs text-gray-700 flex-shrink-0">{totalActive}</span>
        )}
      </div>

      {isExpanded && (
        <div>
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
                  onDelete={deleteTask}
                  onSave={saveTaskTitle}
                />
              ))}
            </SortableContext>
          </DndContext>

          {optimisticTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={toggleTask}
              onDelete={deleteTask}
              onSave={saveTaskTitle}
            />
          ))}

          {showTaskInput ? (
            <form onSubmit={createTask} className="px-2 mt-0.5">
              <input
                ref={taskInputRef}
                className="w-full rounded px-2 py-0.5 bg-gray-800/50 text-xs text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-500/50 transition-colors"
                placeholder="Task name..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onBlur={cancelTaskInput}
                onKeyDown={(e) => {
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
              className="w-full text-left px-4 py-0.5 mt-0.5 text-xs text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
            >
              + Add subtask
            </button>
          )}
        </div>
      )}
    </div>
  );
}
