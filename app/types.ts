export type Task = {
  id: number;
  listId: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  completedBreadcrumb: string | null;
  createdBy: string | null;
  order: number;
  createdAt: string;
};

export type ListData = {
  id: number;
  columnId: number;
  name: string;
  order: number;
  createdAt: string;
  archivedAt: string | null;
  tasks: Task[];
};

export type ColumnData = {
  id: number;
  name: string;
  slug: string;
  order: number;
  createdAt: string;
  ownerUsername: string | null;
  locked: boolean;
  lists: ListData[];
};

export type BoardData = {
  columns: ColumnData[];
  currentUser: string | null;
  isAdmin: boolean;
};
