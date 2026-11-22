"use client";

import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import type { Me, Post, PostsPage, Comment, User, NotificationsResponse, ChatMessage, MessageQuote, ReactionSummary, FollowStatus, StoryDetail, StoryGroup, StoryItem, StoryComment, SearchResponse } from "@/lib/types";

type InfinitePostsData = { pages: PostsPage[]; pageParams: number[] };

// Update post di semua cache list (feed/explore/profile/saved) + cache detail
function mapPostEverywhere(qc: ReturnType<typeof useQueryClient>, postId: string, fn: (p: Post) => Post) {
  qc.setQueriesData<InfinitePostsData>({ queryKey: ["posts"] }, (old) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        posts: page.posts.map((p) => (p.id === postId ? fn(p) : p)),
      })),
    };
  });
  qc.setQueryData<{ post: Post }>(["post", postId], (old) => (old ? { post: fn(old.post) } : old));
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 60_000 });
}

export function useInfinitePosts(opts: {
  feed?: string;
  username?: string;
  limit?: number;
  enabled?: boolean;
}) {
  const { feed = "home", username, limit = 12, enabled = true } = opts;
  return useInfiniteQuery({
    queryKey: ["posts", feed, username ?? null],
    queryFn: ({ pageParam }) => api.posts({ feed, username, page: pageParam, limit }),
    initialPageParam: 0,
    getNextPageParam: (last: PostsPage) => (last.hasMore ? last.nextPage : undefined),
    enabled,
    // Navigasi bolak-balik terasa instan: cache dipakai 15 dtk sebelum dimuat ulang
    staleTime: 15_000,
  });
}

export function usePost(id: string) {
  return useQuery({ queryKey: ["post", id], queryFn: () => api.post(id), staleTime: 10_000 });
}

export function useComments(postId: string) {
  return useInfiniteQuery({
    queryKey: ["comments", postId],
    queryFn: ({ pageParam }) => api.comments(postId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.nextPage : undefined),
    staleTime: 10_000,
  });
}

export function useUser(username: string) {
  return useQuery({ queryKey: ["user", username], queryFn: () => api.user(username) });
}

export function useSuggestions(enabled: boolean) {
  return useQuery({ queryKey: ["suggestions"], queryFn: api.suggestions, staleTime: 60_000, enabled });
}

export function useSearchUsers(search: string) {
  return useQuery({
    queryKey: ["users-search", search],
    queryFn: () => api.searchUsers(search),
    enabled: search.trim().length > 0,
    staleTime: 30_000,
  });
}

// Pencarian global (akun + post + video) — dipakai halaman Jelajahi.
// Query hanya jalan saat ada kata kunci (view sudah menerapkan debounce).
export function useSearchAll(q: string) {
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => api.search(q),
    enabled: q.trim().length > 0,
    staleTime: 15_000,
    placeholderData: (prev) => prev, // kata kunci berganti: hasil lama tetap tampil saat memuat
  });
}

// ---- Mutations ----

export function useLike(onNeedLogin: () => void) {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const me = meData?.user ?? null;
  return useMutation({
    mutationFn: (postId: string) => api.like(postId),
    onMutate: async (postId) => {
      if (!me) {
        onNeedLogin();
        throw new Error("LOGIN_REQUIRED");
      }
      mapPostEverywhere(qc, postId, (p) => ({
        ...p,
        likedByMe: !p.likedByMe,
        likeCount: p.likeCount + (p.likedByMe ? -1 : 1),
      }));
    },
    onSuccess: (result, postId) => {
      mapPostEverywhere(qc, postId, (p) => ({ ...p, likedByMe: result.liked, likeCount: result.likeCount }));
    },
    onError: (err: unknown, postId) => {
      if ((err as Error).message === "LOGIN_REQUIRED") return;
      // Balikkan update optimistik (flip = involutif: dibalik lagi = asli)
      mapPostEverywhere(qc, postId, (p) => ({
        ...p,
        likedByMe: !p.likedByMe,
        likeCount: p.likeCount + (p.likedByMe ? 1 : -1),
      }));
      toast({ title: "Gagal menyukai post", description: (err as Error).message });
    },
    onSettled: (_r, _e, postId) => {
      // sinkronkan ulang detail agar akurat
      qc.invalidateQueries({ queryKey: ["post", postId] });
    },
  });
}

export function useSave(onNeedLogin: () => void) {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const me = meData?.user ?? null;
  return useMutation({
    mutationFn: (postId: string) => api.save(postId),
    onMutate: async (postId) => {
      if (!me) {
        onNeedLogin();
        throw new Error("LOGIN_REQUIRED");
      }
      mapPostEverywhere(qc, postId, (p) => ({ ...p, savedByMe: !p.savedByMe }));
    },
    onSuccess: (result, postId) => {
      mapPostEverywhere(qc, postId, (p) => ({ ...p, savedByMe: result.saved }));
      if (result.saved) qc.invalidateQueries({ queryKey: ["posts", "saved"] });
    },
    onError: (err: unknown, postId) => {
      if ((err as Error).message === "LOGIN_REQUIRED") return;
      // Balikkan update optimistik (flip = involutif: dibalik lagi = asli)
      mapPostEverywhere(qc, postId, (p) => ({ ...p, savedByMe: !p.savedByMe }));
      toast({ title: "Gagal menyimpan post", description: (err as Error).message });
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, text, parentId }: { postId: string; text: string; parentId?: string }) =>
      api.addComment(postId, text, parentId),
    onSuccess: (result: { comment: Comment }, vars) => {
      mapPostEverywhere(qc, vars.postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      qc.setQueryData<{ pages: { comments: Comment[] }[]; pageParams: number[] }>(
        ["comments", vars.postId],
        (old) => {
          if (!old?.pages) return old;
          const first = old.pages[0]
            ? { ...old.pages[0], comments: [result.comment, ...old.pages[0].comments] }
            : { comments: [result.comment], nextPage: null, hasMore: false };
          return { ...old, pages: [first, ...old.pages.slice(1)] };
        }
      );
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal menambah komentar", description: (err as Error).message });
    },
  });
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.deleteComment(commentId),
    onSuccess: (_r, commentId) => {
      let removed = 1;
      qc.setQueryData<{ pages: { comments: Comment[] }[]; pageParams: number[] }>(
        ["comments", postId],
        (old) => {
          if (!old?.pages) return old;
          // Balasan ikut terhapus (cascade) — hitung dan singkirkan sekaligus
          const childIds = new Set<string>();
          for (const page of old.pages) {
            for (const c of page.comments) {
              if (c.parentId === commentId) childIds.add(c.id);
            }
          }
          removed = 1 + childIds.size;
          const isGone = (c: Comment) => c.id === commentId || childIds.has(c.id);
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              comments: page.comments.filter((c) => !isGone(c)),
            })),
          };
        }
      );
      mapPostEverywhere(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - removed) }));
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal menghapus komentar", description: (err as Error).message });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.deletePost(postId),
    onSuccess: (_r, postId) => {
      qc.setQueriesData<InfinitePostsData>({ queryKey: ["posts"] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({ ...page, posts: page.posts.filter((p) => p.id !== postId) })),
        };
      });
      qc.removeQueries({ queryKey: ["post", postId] });
      qc.removeQueries({ queryKey: ["comments", postId] });
      toast({ title: "Post dihapus" });
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal menghapus post", description: (err as Error).message });
    },
  });
}

// ---- Edit post (caption) ----

export function useEditPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, caption }: { postId: string; caption: string }) => api.editPost(postId, caption),
    onSuccess: (data: { post: Post }, vars) => {
      // Perbarui caption di semua cache list (feed/explore/profil/saved) + cache detail
      mapPostEverywhere(qc, vars.postId, (p) => ({ ...p, caption: data.post.caption }));
      // Sinkronkan detail supaya angka & repostOf ikut akurat
      qc.invalidateQueries({ queryKey: ["post", vars.postId] });
      toast({ title: "Caption post diperbarui" });
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal mengedit post", description: (err as Error).message });
    },
  });
}

export function useFollow(onNeedLogin: () => void) {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const me = meData?.user ?? null;
  return useMutation({
    mutationFn: (username: string) => api.follow(username),
    onMutate: async (username: string) => {
      if (!me) {
        onNeedLogin();
        throw new Error("LOGIN_REQUIRED");
      }
      // ---- OPTIMISTIK: ubah status ikut langsung di cache tempat tombol
      // berada (saran beranda & profil). Tanpa ini tombol terasa "mati"
      // karena menunggu balasan server yang bisa lambat.
      const prev = {
        suggestions: qc.getQueryData<{ users: User[] }>(["suggestions"]),
        user: qc.getQueryData<{ user: User }>(["user", username]),
      };
      // NONE -> ACCEPTED (akun privat ditandai PENDING dulu untuk tampilan),
      // ACCEPTED/PENDING -> NONE.
      const flip = (st: FollowStatus | undefined, isPrivate?: boolean): FollowStatus => {
        if (st === "ACCEPTED" || st === "PENDING") return "NONE";
        return isPrivate ? "PENDING" : "ACCEPTED";
      };
      qc.setQueryData<{ users: User[] }>(["suggestions"], (old) =>
        old
          ? {
              users: old.users.map((u) =>
                u.username === username
                  ? { ...u, followStatus: flip(u.followStatus, u.isPrivate), isFollowing: flip(u.followStatus, u.isPrivate) === "ACCEPTED" }
                  : u
              ),
            }
          : old
      );
      qc.setQueryData<{ user: User }>(["user", username], (old) =>
        old
          ? {
              user: {
                ...old.user,
                followStatus: flip(old.user.followStatus, old.user.isPrivate),
                isFollowing: flip(old.user.followStatus, old.user.isPrivate) === "ACCEPTED",
              },
            }
          : old
      );
      return { username, ...prev };
    },
    onSuccess: (result, username) => {
      // ---- Rekonsiliasi ringan: tulis hasil server ke cache yang sama
      // (tanpa invalidate). Satu-satunya invalidasi adalah daftar pengikut
      // yang memang menampilkan angka (jarang dibuka bersamaan).
      const next: FollowStatus = result.pending ? "PENDING" : result.following ? "ACCEPTED" : "NONE";
      qc.setQueryData<{ users: User[] }>(["suggestions"], (old) =>
        old
          ? {
              users: old.users.map((u) =>
                u.username === username
                  ? { ...u, followStatus: next, isFollowing: next === "ACCEPTED", followerCount: result.followerCount }
                  : u
              ),
            }
          : old
      );
      qc.setQueryData<{ user: User }>(["user", username], (old) =>
        old
          ? {
              user: {
                ...old.user,
                followStatus: next,
                isFollowing: next === "ACCEPTED",
                followerCount: result.followerCount,
              },
            }
          : old
      );
      qc.invalidateQueries({ queryKey: ["followers"] });
      qc.invalidateQueries({ queryKey: ["following"] });
      if (result.pending) {
        toast({ title: `Permintaan ikut terkirim ke @${username}` });
      } else if (result.following) {
        toast({ title: `Mengikuti @${username}` });
      } else {
        toast({ title: `Berhenti mengikuti @${username}` });
      }
    },
    onError: (err: unknown, username, ctx) => {
      if ((err as Error).message === "LOGIN_REQUIRED") return;
      // Balikkan ke keadaan sebelum klik (tanpa memuat ulang semuanya).
      if (ctx?.suggestions) qc.setQueryData(["suggestions"], ctx.suggestions);
      if (ctx?.user) qc.setQueryData(["user", username], ctx.user);
      toast({ title: "Gagal memproses follow", description: (err as Error).message });
    },
  });
}

// ---- Repost ----

export function useRepost(onNeedLogin: () => void) {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const me = meData?.user ?? null;
  return useMutation({
    mutationFn: (postId: string) => api.repost(postId),
    onMutate: async (postId: string) => {
      if (!me) {
        onNeedLogin();
        throw new Error("LOGIN_REQUIRED");
      }
    },
    onSuccess: (result, postId) => {
      mapPostEverywhere(qc, postId, (p) => ({
        ...p,
        repostedByMe: result.reposted,
        repostCount: result.repostCount,
      }));
    },
    onError: (err: unknown) => {
      if ((err as Error).message === "LOGIN_REQUIRED") return;
      toast({ title: "Gagal memposting ulang", description: (err as Error).message });
    },
  });
}

export function useQuoteRepost(onSuccess: (post: Post) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, caption }: { postId: string; caption: string }) =>
      api.createPost({ caption, repostOfId: postId }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      onSuccess(data.post);
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal memposting ulang", description: (err as Error).message });
    },
  });
}

// ---- Pengikut / mengikuti ----

export function useFollowers(username: string, enabled: boolean) {
  return useQuery({ queryKey: ["followers", username], queryFn: () => api.followers(username), enabled });
}

export function useFollowing(username: string, enabled: boolean) {
  return useQuery({ queryKey: ["following", username], queryFn: () => api.following(username), enabled });
}

// ---- Permintaan ikuti ----

export function useFollowRequests(enabled: boolean) {
  return useQuery({ queryKey: ["follow-requests"], queryFn: api.followRequests, enabled, refetchInterval: 60_000 });
}

export function useResolveFollowRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ followId, action }: { followId: string; action: "accept" | "reject" }) =>
      api.resolveFollowRequest(followId, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["follow-requests"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal memproses permintaan", description: (err as Error).message });
    },
  });
}

// ---- Pesan / DM ----

type MsgCache = { pages: { messages: ChatMessage[] }[]; pageParams: number[] };

/** Perbarui satu pesan di cache react-query (dipakai edit/hapus/polling). */
function patchMessage(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  messageId: string,
  fn: (m: ChatMessage) => ChatMessage
) {
  qc.setQueryData<MsgCache>(["messages", conversationId], (old) => {
    if (!old?.pages) return old;
    let touched = false;
    const pages = old.pages.map((page) => ({
      ...page,
      messages: page.messages.map((m) => {
        if (m.id !== messageId) return m;
        touched = true;
        return fn(m);
      }),
    }));
    return touched ? { ...old, pages } : old;
  });
}

/** Singkirkan satu pesan dari cache (dipakai batal kirim optimistik). */
function dropMessage(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  messageId: string
) {
  qc.setQueryData<MsgCache>(["messages", conversationId], (old) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        messages: page.messages.filter((m) => m.id !== messageId),
      })),
    };
  });
}

/** Tempel pesan baru ke blok PESAN TERBARU (pages[0]) di AKHIR blok itu.
 *  Server menyusun tiap halaman ascending dan halaman 0 memuat pesan
 *  terbaru, sedangkan halaman-halaman lebih LAMA (hasil fetchNextPage)
 *  menempel di belakang array pages — jadi pesan baru HARUS masuk ujung
 *  pages[0], bukan halaman terakhir (blok tertua).
 *  Idempoten: pesan yang id-nya sudah ada di cache dilewati — menghindari
 *  duplikat saat polling menempel pesan yang sama sesaat sebelum mutation
 *  kirim menyelesaikan diri. */
function appendMessages(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  incoming: ChatMessage[]
) {
  if (incoming.length === 0) return;
  qc.setQueryData<MsgCache>(["messages", conversationId], (old) => {
    if (!old?.pages?.length) return old;
    const known = new Set(old.pages.flatMap((p) => p.messages).map((m) => m.id));
    const adding = incoming.filter((m) => !known.has(m.id));
    if (adding.length === 0) return old;
    const firstPage = old.pages[0];
    const patched = { ...firstPage, messages: [...firstPage.messages, ...adding] };
    return { ...old, pages: [patched, ...old.pages.slice(1)] };
  });
}

// Sinkron cepat saat halaman Pesan terbuka (3 dtk, dipanggil dengan
// intervalMs eksplisit oleh messages.tsx); pemakai lain (sidebar /
// header badge) cukup default 30 dtk — jauh lebih hemat: tidak
// membombardir server dengan query berat di setiap halaman (batas
// konkuren fungsi serverless terasa penuh saat banyak tab terbuka —
// inilah salah satu sumber "lag").
export function useConversations(enabled: boolean, intervalMs = 30_000) {
  return useQuery({ queryKey: ["conversations"], queryFn: api.conversations, enabled, refetchInterval: intervalMs, staleTime: Math.min(intervalMs / 2, 1_000) });
}

export function useMessages(conversationId: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["messages", conversationId],
    queryFn: ({ pageParam }) => api.messages(conversationId as string, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.nextPage : undefined),
    enabled: !!conversationId && enabled,
    // Buka ulang chat terasa instan dalam 10 dtk tanpa refetch penuh
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}

// Kirim pesan teks — OPTIMISTIK: pesan tampil seketika saat tombol kirim
// ditekan (pending), lalu diganti versi asli dari server. Terasa instan
// tanpa menunggu balasan jaringan. Mendukung membalas pesan lain
// (replyToId): kutipan ringkas diambil dari pesan asal di cache supaya
// balasan langsung tampil lengkap sejak detik pertama.
export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text, replyToId }: { text: string; replyToId?: string | null }) =>
      api.sendMessage(conversationId, text, replyToId ?? undefined),
    onMutate: async (vars) => {
      // Kutipan ringkas untuk tampilan optimistik (pesan asal dibaca dari cache)
      let replyTo: MessageQuote | null = null;
      if (vars.replyToId) {
        const cache = qc.getQueryData<{ pages: { messages: ChatMessage[]; other?: { user: { displayName: string } } }[] }>([
          "messages",
          conversationId,
        ]);
        const pages = cache?.pages ?? [];
        const src = pages.flatMap((p) => p.messages).find((m) => m.id === vars.replyToId);
        if (src && !src.deleted) {
          const otherName = pages.find((p) => p.other)?.other?.user?.displayName ?? "";
          replyTo = {
            id: src.id,
            text: src.text,
            kind: src.kind,
            senderName: src.mine ? "" : otherName,
            senderMine: src.mine,
            deleted: false,
          };
        }
      }
      const temp: ChatMessage = {
        id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: vars.text,
        kind: "TEXT",
        media: null,
        mine: true,
        createdAt: new Date().toISOString(),
        readAt: null,
        editedAt: null,
        deleted: false,
        updatedAt: new Date().toISOString(),
        pending: true,
        replyTo,
        reactions: [],
      };
      appendMessages(qc, conversationId, [temp]);
      return { tempId: temp.id };
    },
    onSuccess: (data, _vars, ctx) => {
      // Ganti pesan sementara dengan pesan asli dari server
      if (ctx?.tempId) dropMessage(qc, conversationId, ctx.tempId);
      appendMessages(qc, conversationId, [data.message]);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: unknown, _vars, ctx) => {
      if (ctx?.tempId) dropMessage(qc, conversationId, ctx.tempId);
      toast({ title: "Gagal mengirim pesan", description: (err as Error).message });
    },
  });
}

// Kirim pesan media (foto / video / pesan suara) di DM.
// Upload sudah berjalan sebelum POST ini (ada pratinjau/progress), jadi
// pesan ditempel begitu server mengonfirmasi — tetap instan.
// Mendukung keterangan (caption) DAN kutipan balasan (replyToId).
export function useSendMessageMedia(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, text, replyToId }: { mediaId: string; text?: string; replyToId?: string | null }) =>
      api.sendMessageMedia(conversationId, mediaId, text, replyToId),
    onSuccess: (data) => {
      appendMessages(qc, conversationId, [data.message]);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal mengirim lampiran", description: (err as Error).message });
    },
  });
}

// Edit pesan sendiri (optimistik: teks berubah seketika, label "Diedit" muncul)
export function useEditMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      api.editMessage(conversationId, messageId, text),
    onMutate: async ({ messageId, text }) => {
      patchMessage(qc, conversationId, messageId, (m) => ({
        ...m,
        text,
        editedAt: new Date().toISOString(),
      }));
    },
    onSuccess: (data) => {
      patchMessage(qc, conversationId, data.message.id, (m) => ({
        ...m,
        ...data.message,
        pending: m.pending,
      }));
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: unknown) => {
      // Batalkan perubahan optimistik dengan memuat ulang data sebenarnya
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      toast({ title: "Gagal mengedit pesan", description: (err as Error).message });
    },
  });
}

// Hapus pesan sendiri (optimistik: langsung jadi placeholder "pesan dihapus")
export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => api.deleteMessage(conversationId, messageId),
    onMutate: async (messageId) => {
      patchMessage(qc, conversationId, messageId, (m) => ({
        ...m,
        deleted: true,
        text: "",
        media: null,
        editedAt: null,
      }));
    },
    onSuccess: (_r, messageId) => {
      patchMessage(qc, conversationId, messageId, (m) => ({ ...m, deleted: true, text: "", media: null, editedAt: null }));
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: unknown, messageId) => {
      // Kembalikan pesan semula lalu muat ulang keadaan sebenarnya
      patchMessage(qc, conversationId, messageId, (m) => ({ ...m, deleted: false }));
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      toast({ title: "Gagal menghapus pesan", description: (err as Error).message });
    },
  });
}

export function useStartConversation() {
  return useMutation({
    mutationFn: (username: string) => api.startConversation(username),
    onError: (err: unknown) => {
      toast({ title: "Gagal membuka percakapan", description: (err as Error).message });
    },
  });
}

/** Terapkan satu aksi reaksi pada daftar reaksi (untuk tampilan optimistik):
 *  - emoji yang sudah milikku   -> lepas reaksi milikku (toggle mati)
 *  - emoji lain                 -> pindahkan reaksi milikku ke emoji itu
 *  - null                       -> hapus reaksi milikku */
function applyReaction(list: ReactionSummary[], emoji: string | null): ReactionSummary[] {
  const mineEmoji = list.find((r) => r.mine)?.emoji ?? null;
  const stripped = list
    .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r))
    .filter((r) => r.count > 0);
  if (!emoji || mineEmoji === emoji) return stripped;
  const existing = stripped.find((r) => r.emoji === emoji);
  if (existing) return stripped.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r));
  return [...stripped, { emoji, count: 1, mine: true }];
}

// Reaksi emoji pada pesan — optimistik: pil reaksi di bawah bubble berubah
// seketika (tambah/pindah/hapus), server menyusul menyimpan toggle-nya.
// Kegagalan -> muat ulang daftar pesan agar kembali ke keadaan sebenarnya.
export function useReactMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string | null }) =>
      api.reactMessage(conversationId, messageId, emoji),
    onMutate: async ({ messageId, emoji }) => {
      patchMessage(qc, conversationId, messageId, (m) => ({
        ...m,
        reactions: applyReaction(m.reactions ?? [], emoji),
      }));
    },
    onError: (err: unknown) => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      toast({ title: "Gagal menyimpan reaksi", description: (err as Error).message });
    },
  });
}

// ---- Pengaturan akun ----

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateMe,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["user"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      if (data.user?.username) qc.setQueryData(["user", data.user.username], { user: data.user });
      if (!data.passwordChanged) toast({ title: "Perubahan disimpan" });
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal menyimpan", description: (err as Error).message });
    },
  });
}

export function useLogin(
  onSuccess: (me: Me) => void,
  onCodeChallenge?: (c: { userId: string; email: string; devCode?: string }) => void
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.login(username, password),
    onSuccess: (data) => {
      // Langkah 2FA: password benar, kode verifikasi dikirim ke email — lanjut ke layar kode
      if (data.step === "code") {
        onCodeChallenge?.({ userId: data.userId, email: data.email, devCode: data.devCode });
        return;
      }
      qc.setQueryData(["me"], { user: data.user });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      onSuccess(data.user);
    },
    onError: (err: unknown) => {
      toast({ title: "Login gagal", description: (err as Error).message, variant: "destructive" });
    },
  });
}

export function useLoginVerify(onSuccess: (me: Me) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, code }: { userId: string; code: string }) => api.loginVerify(userId, code),
    onSuccess: (data) => {
      qc.setQueryData(["me"], { user: data.user });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      onSuccess(data.user);
    },
    onError: (err: unknown) => {
      toast({ title: "Verifikasi gagal", description: (err as Error).message, variant: "destructive" });
    },
  });
}

export function useRegister(onSuccess: (me: Me) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, displayName, email, password }: { username: string; displayName: string; email: string; password: string }) =>
      api.register(username, displayName, email, password),
    onSuccess: (data) => {
      if (data.step !== "done") return; // register selalu langsung masuk
      qc.setQueryData(["me"], { user: data.user });
      onSuccess(data.user);
    },
    onError: (err: unknown) => {
      toast({ title: "Pendaftaran gagal", description: (err as Error).message, variant: "destructive" });
    },
  });
}

export function useLogout(onSuccess: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.setQueryData(["me"], { user: null });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      onSuccess();
      toast({ title: "Kamu sudah keluar", description: "Sampai jumpa lagi di SkelzHub!" });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, displayName, bio }: { username: string; displayName: string; bio: string }) =>
      api.updateUser(username, { displayName, bio }),
    onSuccess: (data) => {
      qc.setQueryData(["user", data.user.username], { user: data.user });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      toast({ title: "Profil diperbarui" });
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal memperbarui profil", description: (err as Error).message });
    },
  });
}

export function useCreatePost(onSuccess: (post: Post) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caption, mediaId, repostOfId }: { caption: string; mediaId?: string; repostOfId?: string }) =>
      api.createPost({ caption, mediaId, repostOfId }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      onSuccess(data.post);
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal membagikan post", description: (err as Error).message });
    },
  });
}

// ---- Notifikasi & laporan ----

export function useNotifications(enabled: boolean) {
  return useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: api.notifications,
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

// ---- Story ----

export function useStories(enabled: boolean) {
  return useQuery({
    queryKey: ["stories"],
    queryFn: api.stories,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    // Story baru teman langsung terlihat saat kembali ke tab
    refetchOnWindowFocus: true,
  });
}

export function useCreateStory(onSuccess: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, caption, audioMediaId }: { mediaId: string; caption?: string; audioMediaId?: string | null }) =>
      api.createStory({ mediaId, caption, audioMediaId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
      onSuccess();
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal membagikan story", description: (err as Error).message });
    },
  });
}

export function useStoryDetail(storyId: string | null, enabled: boolean) {
  return useQuery<StoryDetail>({
    queryKey: ["story-detail", storyId],
    queryFn: () => api.storyDetail(storyId as string),
    enabled: !!storyId && enabled,
  });
}

export function useDeleteStory(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) => api.deleteStory(storyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
      onDone();
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal menghapus story", description: (err as Error).message });
    },
  });
}

// Update item story di cache ["stories"] (rail + penampil memakai cache ini)
function mapStoryEverywhere(qc: ReturnType<typeof useQueryClient>, storyId: string, fn: (s: StoryItem) => StoryItem) {
  qc.setQueriesData<{ groups: StoryGroup[] }>({ queryKey: ["stories"] }, (old) => {
    if (!old?.groups) return old;
    return {
      ...old,
      groups: old.groups.map((g) => ({
        ...g,
        items: g.items.map((s) => (s.id === storyId ? fn(s) : s)),
      })),
    };
  });
}

// Tandai satu story "sudah dilihat" di cache ["stories"] — ring di rail &
// avatar langsung memucat (abu-abu) SEKETIKA tanpa menunggu refetch.
// hasUnseen grup dihitung ulang dari status terbaru tiap itemnya.
export function markStorySeenEverywhere(qc: ReturnType<typeof useQueryClient>, storyId: string) {
  qc.setQueriesData<{ groups: StoryGroup[] }>({ queryKey: ["stories"] }, (old) => {
    if (!old?.groups) return old;
    let touched = false;
    const groups = old.groups.map((g) => {
      if (!g.items.some((s) => s.id === storyId && !s.seen)) return g;
      touched = true;
      const items = g.items.map((s) => (s.id === storyId ? { ...s, seen: true } : s));
      return { ...g, items, hasUnseen: items.some((s) => !s.seen) };
    });
    return touched ? { ...old, groups } : old;
  });
}

// Like/unlike story (toggle) — optimistik: UI berubah seketika, server menyusul.
// Progress playback TIDAK terpengaruh (timer story berbasis ref di story.tsx).
export function useStoryLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) => api.storyLike(storyId),
    onMutate: async (storyId) => {
      mapStoryEverywhere(qc, storyId, (s) => ({
        ...s,
        likedByMe: !s.likedByMe,
        likeCount: s.likeCount + (s.likedByMe ? -1 : 1),
      }));
    },
    onSuccess: (result, storyId) => {
      mapStoryEverywhere(qc, storyId, (s) => ({ ...s, likedByMe: result.liked, likeCount: result.likeCount }));
    },
    onError: (err: unknown, storyId) => {
      // Balikkan perubahan optimistik
      mapStoryEverywhere(qc, storyId, (s) => ({
        ...s,
        likedByMe: !s.likedByMe,
        likeCount: s.likeCount + (s.likedByMe ? 1 : -1),
      }));
      toast({ title: "Gagal menyukai story", description: (err as Error).message });
    },
  });
}

export function useStoryComments(storyId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["story-comments", storyId],
    queryFn: () => api.storyComments(storyId as string),
    enabled: !!storyId && enabled,
  });
}

export function useAddStoryComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, text, parentId }: { storyId: string; text: string; parentId?: string | null }) =>
      api.addStoryComment(storyId, text, parentId),
    onSuccess: (result: { comment: StoryComment }, vars) => {
      // API mengembalikan urutan menaik -> komentar baru ditempel di akhir daftar
      qc.setQueryData<{ comments: StoryComment[] }>(["story-comments", vars.storyId], (old) => {
        if (!old) return old;
        return { ...old, comments: [...old.comments, result.comment] };
      });
      mapStoryEverywhere(qc, vars.storyId, (s) => ({ ...s, commentCount: s.commentCount + 1 }));
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal menambah komentar", description: (err as Error).message });
    },
  });
}

export function useDeleteStoryComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, commentId }: { storyId: string; commentId: string }) =>
      api.deleteStoryComment(storyId, commentId),
    onSuccess: (_r, vars) => {
      // Balasan ikut terhapus (cascade) — hitung dan singkirkan sekaligus
      let removed = 1;
      qc.setQueryData<{ comments: StoryComment[] }>(["story-comments", vars.storyId], (old) => {
        if (!old) return old;
        const childIds = new Set(old.comments.filter((c) => c.parentId === vars.commentId).map((c) => c.id));
        removed = 1 + childIds.size;
        return { ...old, comments: old.comments.filter((c) => c.id !== vars.commentId && !childIds.has(c.id)) };
      });
      mapStoryEverywhere(qc, vars.storyId, (s) => ({ ...s, commentCount: Math.max(0, s.commentCount - removed) }));
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal menghapus komentar", description: (err as Error).message });
    },
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.markNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useReportPost() {
  return useMutation({
    mutationFn: ({ postId, reason }: { postId: string; reason: string }) => api.reportPost(postId, reason),
    onSuccess: () => {
      toast({
        title: "Laporan terkirim",
        description: "Terima kasih! Admin akan meninjau post ini.",
      });
    },
    onError: (err: unknown) => {
      toast({ title: "Gagal melaporkan", description: (err as Error).message });
    },
  });
}
