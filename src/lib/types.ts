// Client-safe shared types for SkelzHub

export type Role = "USER" | "ADMIN" | "OWNER";
export type MediaType = "IMAGE" | "VIDEO";
export type MessageKind = "TEXT" | "IMAGE" | "VIDEO" | "VOICE";
export type NotificationType = "LIKE" | "COMMENT" | "FOLLOW" | "FOLLOW_REQUEST" | "FOLLOW_ACCEPT" | "REPOST" | "STORY_VIEW" | "STORY_LIKE" | "STORY_COMMENT" | "POST_VIEW";
export type ReportStatus = "PENDING" | "RESOLVED" | "DISMISSED";
export type FollowStatus = "ACCEPTED" | "PENDING" | "NONE";
export type Lang = "id" | "en" | "es";

export type UserBrief = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: number;
  /** URL foto profil (null = avatar gradient) */
  avatar?: string | null;
  /** Badge admin di sebelah nama */
  role?: Role;
};

export type Me = {
  id: string;
  username: string;
  email?: string | null;
  displayName: string;
  bio: string;
  avatarColor: number;
  avatar?: string | null;
  isPrivate: boolean;
  role: Role;
};

export type MeResponse = {
  user: Me | null;
  bannedMessage?: string;
};

/** Respons /api/auth/login — 2 langkah (2FA via kode email):
 *  step "code" = password benar, tunggu kode verifikasi;
 *  step "done" = langsung masuk (akun lama tanpa email / verifikasi selesai). */
export type LoginResponse =
  | { step: "code"; userId: string; email: string; emailSent: boolean; emailConfigured?: boolean; devCode?: string }
  | { step: "done"; user: Me };

export type Post = {
  id: string;
  caption: string;
  /** URL media (mis. /api/media/xxxx); null untuk repost murni */
  media: string | null;
  /** VIDEO = tampil di Shorts */
  type: MediaType;
  createdAt: string;
  author: UserBrief;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  repostedByMe: boolean;
  /** Post asli yang di-posting ulang (untuk render bersarang) */
  repostOf?: Post | null;
  previewComments?: Comment[];
};

export type PostsPage = {
  posts: Post[];
  nextPage: number | null;
  hasMore: boolean;
  /** true = daftar disembunyikan (mis. tab repost khusus pengikut) */
  hidden?: boolean;
};

/** Respons /api/search?q= — akun, post, dan video yang cocok */
export type SearchResponse = {
  users: User[];
  posts: Post[];
  videos: Post[];
};

export type Comment = {
  id: string;
  text: string;
  createdAt: string;
  author: UserBrief;
  /** ID komentar utama yang dibalas (null = komentar utama) */
  parentId?: string | null;
  /** Penulis komentar yang dibalas (untuk tampilan "membalas @xxx") */
  replyTo?: UserBrief | null;
  isMine?: boolean;
};

export type CommentsPage = {
  comments: Comment[];
  nextPage: number | null;
  hasMore: boolean;
};

export type User = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarColor: number;
  avatar?: string | null;
  isPrivate: boolean;
  role: Role;
  /** Terakhir aktif (null = tidak diketahui) — dipakai status online/last seen */
  lastSeenAt?: string | null;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing?: boolean;
  /** PENDING = permintaan ikut menunggu persetujuan */
  followStatus?: FollowStatus;
  isMe?: boolean;
};

export type FollowListItem = {
  id: string;
  status: FollowStatus;
  user: UserBrief;
};

// ---- Pesan / DM ----

export type ConversationItem = {
  id: string;
  user: UserBrief & { online?: boolean; lastSeenAt?: string | null };
  lastMessage: string | null;
  lastMessageKind?: MessageKind | null;
  /** pesan terakhir sudah dihapus -> preview "Pesan dihapus" */
  lastMessageDeleted?: boolean;
  lastMessageAt: string | null;
  lastMessageMine: boolean;
  unread: number;
};

export type MessagesPage = {
  messages: ChatMessage[];
  other?: ChatPresence;
  nextPage: number | null;
  hasMore: boolean;
};

export type ChatPresence = {
  user: UserBrief;
  online: boolean;
  lastSeenAt: string | null;
  typing: boolean;
};

export type ChatMessage = {
  id: string;
  text: string;
  kind?: MessageKind;
  media?: string | null;
  mine: boolean;
  createdAt: string;
  readAt: string | null;
  /** pesan pernah diedit (tampil label "Diedit") */
  editedAt?: string | null;
  /** pesan dihapus (soft delete) — tampil placeholder */
  deleted?: boolean;
  /** kapan baris pesan terakhir berubah (cursor sinkron polling) */
  updatedAt?: string;
  /** status kirim sementara di UI optimistik */
  pending?: boolean;
  /** pesan yang dibalas (null = bukan balasan) */
  replyTo?: MessageQuote | null;
  /** reaksi emoji pada pesan ini */
  reactions?: ReactionSummary[];
};

/** Ringkasan pesan yang dibalas (tampilan kutipan di atas bubble) */
export type MessageQuote = {
  id: string;
  text: string;
  kind?: MessageKind;
  /** nama penampil pengirim kutipan */
  senderName: string;
  /** pengirim kutipan = aku sendiri */
  senderMine: boolean;
  /** pesan asal sudah dihapus (tampil "Pesan dihapus") */
  deleted?: boolean;
};

/** Reaksi emoji pada satu pesan: emoji, jumlah, dan apakah aku ikut bereaksi */
export type ReactionSummary = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type NewMessagesResponse = {
  messages: ChatMessage[];
  other?: ChatPresence;
  mineLastReadAt?: string | null;
};

// ---- Story ----

export type StoryItem = {
  id: string;
  media: string;
  type: MediaType;
  caption: string;
  createdAt: string;
  seen: boolean;
  /** Jumlah suka pada story */
  likeCount: number;
  likedByMe: boolean;
  /** Jumlah komentar pada story */
  commentCount: number;
  /** Jumlah penonton (total story views) */
  viewCount: number;
  /** URL sound/musik latar story (null = tanpa sound) */
  audio?: string | null;
};

export type StoryComment = {
  id: string;
  text: string;
  createdAt: string;
  author: UserBrief;
  /** ID komentar story yang dibalas (null = komentar utama) */
  parentId?: string | null;
  /** Penulis komentar yang dibalas (untuk tampilan "membalas @xxx") */
  replyTo?: UserBrief | null;
  isMine?: boolean;
};

export type StoryGroup = {
  author: UserBrief;
  items: StoryItem[];
  hasUnseen: boolean;
  isMe?: boolean;
  latestAt: string;
};

export type StoryViewer = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: number;
  avatar?: string | null;
  role?: Role;
  seenAt: string;
};

export type StoryDetail = {
  story: StoryItem & { expiresAt: string };
  viewers: StoryViewer[];
  viewCount: number;
};

// ---- Notifikasi ----

export type NotificationItem = {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor: UserBrief;
  postId: string | null;
  postMedia: string | null;
  postType: MediaType | null;
  commentText: string | null;
};

export type NotificationsResponse = {
  items: NotificationItem[];
  unread: number;
};

// ---- Admin ----

export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: number;
  avatar?: string | null;
  role: Role;
  bannedAt: string | null;
  banReason: string | null;
  createdAt: string;
  postCount: number;
  followerCount: number;
};

export type AdminPost = Post & {
  reportCount: number;
};

export type AdminComment = {
  id: string;
  text: string;
  createdAt: string;
  author: UserBrief;
  postId: string;
  postMedia: string;
  postType: MediaType;
  postCaption: string;
  postAuthor: UserBrief;
};

export type ReportItem = {
  id: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  reporter: UserBrief;
  post: {
    id: string;
    caption: string;
    media: string;
    type: MediaType;
    createdAt: string;
    author: UserBrief;
    likeCount: number;
    commentCount: number;
    reportCount: number;
  };
};

export type AdminStats = {
  totalUsers: number;
  admins: number;
  bannedUsers: number;
  totalPosts: number;
  totalShorts: number;
  totalComments: number;
  totalLikes: number;
  pendingReports: number;
  latestUsers: AdminUser[];
  latestPosts: Post[];
};
