"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollbarFade } from "@/lib/useScrollbarFade";
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
import HoldToDelete from "./HoldToDelete";
import GraveyardPanel from "./GraveyardPanel";

type ColumnPanelProps = {
  column: ColumnData;
  currentUser: string | null;
  isAdmin: boolean;
  onRefresh: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
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
        dragHandleProps={{ ...attributes, ...(listeners ?? {}) } as React.HTMLAttributes<HTMLButtonElement>}
      />
    </div>
  );
}

export default function ColumnPanel({ column, currentUser, isAdmin, onRefresh, collapsed, onToggleCollapse }: ColumnPanelProps) {
  const [newListName, setNewListName] = useState("");
  const [showNewListInput, setShowNewListInput] = useState(false);
  const listInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollbarFade(scrollRef);

  // New agent column — only the principal (first column) can create these
  const [newAgentName, setNewAgentName] = useState("");
  const [showNewAgentInput, setShowNewAgentInput] = useState(false);
  const agentInputRef = useRef<HTMLInputElement>(null);

  // Column rename — double-click the name to edit
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(column.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function saveColumnName() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === column.name) {
      setIsEditingName(false);
      setNameValue(column.name);
      return;
    }
    await fetch(`/api/columns/${column.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setIsEditingName(false);
  }

  async function toggleLock() {
    await fetch(`/api/columns/${column.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !column.locked }),
    });
  }

  const isPrincipal = column.order === 0;

  // Multi-user badge: "YOU" on your column, "TEAMMATE" on other humans, "AGENT" on unowned.
  // Falls back to Principal/Agent labels for legacy installs with no ownerUsername.
  const isMultiUser = currentUser !== null;
  const isOwnColumn = isMultiUser && column.ownerUsername === currentUser;
  const badgeLabel = isOwnColumn
    ? 'YOU'
    : column.isAgent
    ? 'AGENT'
    : column.ownerUsername
    ? 'TEAMMATE'
    : isPrincipal
    ? 'Principal'
    : 'Agent';
  const isAgentColumn = column.isAgent || (!column.ownerUsername && !isPrincipal);
  const badgeClass = isOwnColumn
    ? 'text-xs text-accent-500 uppercase tracking-wider font-semibold'
    : isAgentColumn
    ? 'text-xs text-pink-300 uppercase tracking-wider'
    : 'text-xs text-accent-500 uppercase tracking-wider';

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

  async function createColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    await fetch("/api/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAgentName }),
    });
    setNewAgentName("");
    setShowNewAgentInput(false);
  }

  function openNewAgentInput() {
    setShowNewAgentInput(true);
    setTimeout(() => agentInputRef.current?.focus(), 0);
  }

  function cancelNewAgent() {
    if (!newAgentName.trim()) {
      setShowNewAgentInput(false);
      setNewAgentName("");
    }
  }

  // Non-own columns (teammates + agents) can be collapsed
  const canCollapse = !isOwnColumn;

  // ── Collapsed view ──────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex flex-col min-w-0 h-full">
        {/* Mobile: horizontal collapsed header (full width accordion) */}
        <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold text-gray-200 truncate">{column.name}</h2>
            <span className={badgeClass}>{badgeLabel}</span>
          </div>
          <button
            onClick={onToggleCollapse}
            title="Expand"
            className="text-gray-500 hover:text-gray-300 flex-shrink-0 ml-2"
            style={{ cursor: "pointer" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        {/* Desktop: narrow vertical strip */}
        <div className="hidden md:flex flex-col items-center pt-3 pb-2 gap-3 h-full">
          <button
            onClick={onToggleCollapse}
            title="Expand column"
            className="text-gray-600 hover:text-gray-300 flex-shrink-0"
            style={{ cursor: "pointer" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span
            className="text-xs text-gray-600 font-medium select-none"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {column.name}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-w-0 md:flex-1 md:min-h-0">
      {/* Column header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              className="flex-1 bg-transparent outline-none text-base font-semibold text-gray-200 border-b border-accent-500 mr-2"
              value={nameValue}
              autoFocus
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveColumnName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveColumnName();
                if (e.key === "Escape") {
                  setIsEditingName(false);
                  setNameValue(column.name);
                }
              }}
            />
          ) : (
            <h2
              className="text-base font-semibold text-gray-200 cursor-default select-none"
              onDoubleClick={() => {
                setIsEditingName(true);
                setNameValue(column.name);
                setTimeout(() => nameInputRef.current?.select(), 0);
              }}
              title="Double-click to rename"
            >
              {column.name}
            </h2>
          )}
          <div className="flex items-center gap-2 flex-shrink-0 min-h-[36px]">
            <span className={badgeClass}>
              {badgeLabel}
            </span>
            {/* Lock toggle — admin sees clickable icon; others see static lock when locked */}
            {isAdmin ? (
              <button
                onClick={toggleLock}
                title={column.locked
                  ? "Currently: view-only for teammates · Click to: allow editing"
                  : "Currently: open to teammates · Click to: make view-only"}
                className={`transition-colors ${column.locked ? "text-accent-500 hover:text-accent-400" : "text-gray-700 hover:text-gray-500"}`}
                style={{ cursor: "pointer" }}
              >
                {column.locked ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="3" y="7" width="10" height="8" rx="1.5" />
                    <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="3" y="7" width="10" height="8" rx="1.5" />
                    <path d="M5 7V5a3 3 0 0 1 6 0" />
                  </svg>
                )}
              </button>
            ) : column.locked ? (
              <span title="Currently: view-only — owner has restricted editing" className="text-accent-600">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="3" y="7" width="10" height="8" rx="1.5" />
                  <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                </svg>
              </span>
            ) : null}
            {/* Collapse toggle — only on non-own columns (teammates + agents) */}
            {canCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Collapse column"
                className="text-gray-700 hover:text-gray-400 transition-colors"
                style={{ cursor: "pointer" }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {/* Delete — hidden on teammate and agent columns in multi-user mode;
                agents must be removed via the admin panel to keep users.json in sync */}
            {!isPrincipal && (!isMultiUser || isOwnColumn) && (
              <HoldToDelete
                onConfirm={async () => {
                  await fetch(`/api/columns/${column.id}`, { method: "DELETE" });
                }}
                label="Delete column?"
              />
            )}
          </div>
        </div>
      </div>

      {/* Column content — scrollable on desktop, natural height on mobile */}
      <div ref={scrollRef} className="column-scroll md:flex-1 md:overflow-y-auto px-4 py-3 space-y-3">
        {column.lists.length === 0 && (
          <button
            onClick={openNewListInput}
            className="flex flex-col items-center justify-center py-12 w-full text-gray-600 hover:text-gray-400 transition-colors"
          >
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
            <p className="text-xs">Add your first project</p>
          </button>
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

        {/* New task (list): button → input */}
        {showNewListInput ? (
          <form onSubmit={createList}>
            <input
              ref={listInputRef}
              className="w-full rounded-lg px-3 py-2 bg-gray-900/50 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent-500 transition-all"
              placeholder="Project name..."
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
            + New project
          </button>
        )}

        {/* New column — only shown on the principal column, hidden in multi-user mode
            (in multi-user mode, columns are created automatically on first login) */}
        {isPrincipal && !isMultiUser && (
          showNewAgentInput ? (
            <form onSubmit={createColumn}>
              <input
                ref={agentInputRef}
                className="w-full rounded-lg px-3 py-2 bg-gray-900/50 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-accent-500 transition-all"
                placeholder="Column name..."
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                onBlur={cancelNewAgent}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowNewAgentInput(false);
                    setNewAgentName("");
                  }
                }}
              />
            </form>
          ) : (
            <button
              onClick={openNewAgentInput}
              className="w-full rounded-lg px-3 py-2 text-sm text-gray-600 hover:text-gray-400 hover:bg-gray-900/30 border border-transparent hover:border-gray-800/50 transition-all text-left"
              style={{ cursor: "pointer" }}
            >
              + New column
            </button>
          )
        )}

        {/* Graveyard — shown on every column, scoped to that column's archived projects */}
        <GraveyardPanel columnId={column.id} onResurrect={onRefresh} />
      </div>
    </div>
  );
}
