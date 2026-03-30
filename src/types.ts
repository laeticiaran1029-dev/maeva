export interface Event {
  id: string;
  title: string;
  date: string;
  description: string;
}

export interface AttendanceRecord {
  id: string;
  studentName: string;
  studentId: string;
  eventId: string;
  timestamp: string;
  verified: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  presenceCode?: string;
  codeRequested?: boolean;
  message?: string;
}
