export interface Quote {
  id: number;
  work_id: string;
  user_id?: string | null;
  quote: string;
  page_number?: number | null;
  created_at: string;
  work?: Work | null;
  explanation?: string | null;
}

export interface ConversationMessage {
  id: number;
  role: "user" | "assistant" | "meta";
  content: string;
  created_at: string;
  quote_id: number;
  meta_type?: "model";
  meta_display?: "divider";
}

export interface ReadingActivity {
  user_id?: string | null;
  work_id: string;
  notes?: string | null;
  current_page?: number | null;
  page_count?: number | null;
  created_at: string;
  work?: Work | null;
}

export interface Work {
  id: string;
  title: string;
  files?: Record<string, string>;
  current_page?: number;
  goodreads_id?: string | null;
  cover_img_url?: string | null;
  background_img_url?: string | null;
  dropbox_link?: string | null;
  amazon_asin?: string | null;
  tags: string[];
  authors: string[];
  page_count: number;
  file_id?: string | null;
  read?: boolean;
  liked?: boolean;
  shelved?: boolean;
  rating?: number;
  quotes?: Quote[];
}

export interface Author {
  id: number;
  name: string;
  bio?: string | null;
  goodreads_id?: string | null;
  followed?: boolean;
  avatar_img_url?: string | null;
  works_count: number;
}

export interface User {
  id: string;
  username: string;
  role: "admin" | "guest";
  email?: string | null;
  is_email_public?: boolean | null;
  avatar_url?: string | null;
}

export interface InboxNotification {
  id: number;
  type: string;
  work_id?: string | null;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at: string;
}

export interface ExploreResponse {
  showcase: Work[];
  catalogue: {
    with_cover: Work[];
    without_cover: Work[];
  };
}
