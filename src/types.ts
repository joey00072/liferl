export type Task = {
  id: string;
  title: string;
  reward: number;
  createdAt: string;
  active: boolean;
  doneOnDate: boolean;
  doneToday: boolean;
  icon?: string;
  category?: string;
  target?: string;
  score?: number;
  metric?: string;
  note?: string;
  archived?: boolean;
};

export type LogEntry = {
  date: string;
  taskId: string;
  reward: number;
  completedAt: string;
};

export type PomodoroSession = {
  id: string;
  taskId?: string;
  mode?: "focus" | "short_break" | "long_break";
  startedAt: string;
  endedAt?: string;
  plannedSeconds: number;
  actualSeconds?: number;
  status: "running" | "completed" | "canceled" | "paused";
  timingSource: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type State = {
  date: string;
  version?: number;
  serverTime?: string;
  dayNote?: string;
  mood?: number;
  energy?: number;
  sleep?: string;
  weight?: string;
  totalReward: number;
  dayReward: number;
  possibleDayReward: number;
  completedDay: number;
  totalDay: number;
  todayReward: number;
  possibleTodayReward: number;
  completedToday: number;
  totalToday: number;
  tasks: Task[];
  archivedTasks: Task[];
  logs: LogEntry[];
  charts: ChartsState;
  activeSession?: PomodoroSession | null;
  pomodoroSessions?: PomodoroSession[];
};

export type DayPoint = {
  date: string;
  endDate?: string;
  label?: string;
  reward: number;
  complete: boolean;
  expected: number;
  completed: number;
};

export type ChartEntry = {
  date: string;
  taskId: string;
  score: number;
  done: boolean;
};

export type TaskStat = {
  id: string;
  title: string;
  completed: number;
  totalDays: number;
  rate: number;
  rewardTotal: number;
};

export type ChartsState = {
  firstDate: string;
  currentDate: string;
  entries: ChartEntry[];
  daily: DayPoint[];
  taskStats: TaskStat[];
};

export type ChartRange = "7d" | "15d" | "30d" | "90d" | "custom" | "1y" | "all";
export type ChartGranularity = "auto" | "day" | "week" | "month";

export type Tab = "quests" | "charts";
