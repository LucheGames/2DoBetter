export type Task = {
  id: number;
  listId: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  completedBreadcrumb: string | null;
  order: number;
  createdAt: string;
};

export type ListData = {
  id: number;
  columnId: number;
  parentId: number | null;
  name: string;
  order: number;
  createdAt: string;
  tasks: Task[];
  children: ListData[];
};

export type ColumnData = {
  id: number;
  name: string;
  slug: string;
  order: number;
  createdAt: string;
  lists: ListData[];
};

export type BoardData = {
  columns: ColumnData[];
};
