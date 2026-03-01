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
import { ColumnData, ListData } from "../types";
import ListCard from "./ListCard";
import CompletedSection from "./CompletedSection";

type ColumnPanelProps = {
  column: ColumnData;
  onRefresh: () => void;
};

/** Sortable wrapper for a ListCard — provides the drag handle props */
function SortableListCard({
  list,
  onRefresh,
}: {
  list: ListData;
  onRefresh: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id });

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
      <ListCard
        list={list}
        onRefresh={onRefresh}
        dragHandleProps={{ ...attributes, ...listeners } as Record<string, unknown>}
      />
    </div>
  );
}

export default function ColumnPanel({ column, onRefresh }: ColumnPanelProps) {
  const [newListName, setNewListName] = useState("");
  const [showNewListInput, setShowNewListInput] = useState(false);
  const listInputRef = useRef<HTMLInputElement>(null);

  // Local list order state — synced from props, updated optimistically on drag
  const listIdsStr = column.lists.map((l) => l.id).join(",");
  const [listIds, setListIds] = useState<number[]>(() => column.lists.map((l) => l.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setListIds(column.lists.map((l) => l.id)); }, [listIdsStr]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleListDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = listIds.indexOf(Number(active.id));
    const newIndex = listIds.indexOf(Number(over.id));
    const newIds = arrayMove(listIds, oldIndex, newIndex);
    setListIds(newIds);
    await fetch("/api/lists/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: newIds }),
    });
    onRefresh();
  }

  const orderedLists = listIds
    .map((id) => column.lists.find((l) => l.id === id))
    .filter(Boolean) as ListData[];

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    await fetch(`/api/columns/${column.id}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName }),
    });
    setNewListName("");
    setShowNewListInput(false);
    onRefresh();
  }

  function openNewListInput() {
    setShowNewListInput(true);
    setTimeout(() => listInputRef.current?.focus(), 0);
  }

  function cancelNewList() {
    if (!newListName.trim()) {
      setShowNewListInput(false);
      setNewListName("");
    }
  }

  return (
    <div className="flex flex-col min-w-0 md:flex-1 md:min-h-0">
      {/* Column header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-200">
            {column.name}
          </h2>
          <span className="text-xs text-gray-600 uppercase tracking-wider">
            {column.slug === "dave" ? "Principal" : "Agent"}
          </span>
        </div>
      </div>

      {/* Column content — scrollable on desktop, natural height on mobile */}
      <div className="md:flex-1 md:overflow-y-auto p-3 space-y-3">
        {column.lists.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-600">
            <svg
              className="w-10 h-10 mb-2 opacity-20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-xs">No lists yet</p>
          </div>
        )}

        {/* Sortable lists */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleListDragEnd}
        >
          <SortableContext items={listIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {orderedLists.map((list) => (
                <SortableListCard key={list.id} list={list} onRefresh={onRefresh} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* New list: button → input */}
        {showNewListInput ? (
          <form onSubmit={createList}>
            <input
              ref={listInputRef}
              className="w-full rounded-lg px-3 py-2 bg-gray-900/50 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-blue-500 transition-all"
              placeholder="List name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onBlur={cancelNewList}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowNewListInput(false);
                  setNewListName("");
                }
              }}
            />
          </form>
        ) : (
          <button
            onClick={openNewListInput}
            className="w-full rounded-lg px-3 py-2 text-sm text-gray-600 hover:text-gray-400 hover:bg-gray-900/30 border border-transparent hover:border-gray-800/50 transition-all text-left"
            style={{ cursor: "pointer" }}
          >
            + New agent
          </button>
        )}

        {/* Completed section */}
        <CompletedSection lists={column.lists} onRefresh={onRefresh} />
      </div>
    </div>
  );
}
