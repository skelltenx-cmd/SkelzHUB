"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  Camera,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Moon,
  Settings as SettingsIcon,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { api, uploadCaps } from "@/lib/api";
import { LANGS, useLangStore, useT } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import type { Me } from "@/lib/types";
import { useUpdateMe, useLogout } from "../hooks";
import { UserAvatar } from "../user-avatar";
import { AvatarCropDialog } from "../avatar-crop";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function SettingsView({ me }: { me: Me | null }) {
  const t = useT();
  const qc = useQueryClient();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const { resolvedTheme, setTheme } = useTheme();
  const updateMe = useUpdateMe();
  const logout = useLogout(() => {
    window.location.hash = "#/";
  });

  const [name, setName] = useState(me?.displayName ?? "");
  const [bio, setBio] = useState(me?.bio ?? "");
  const [avatar, setAvatar] = useState<string | null>(me?.avatar ?? null);
  const [isPrivate, setIsPrivate] = useState(!!me?.isPrivate);
  // Ganti password lewat kode verifikasi email (password lama tidak perlu)
  const [passCode, setPassCode] = useState("");
  const [newPass, setNewPass] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingAvatarId = useRef<string | null>(null);

  useEffect(() => {
    document.title = `${t("settings.title")} · SkelzHub`;
  }, [t]);

  useEffect(() => {
    if (me) {
      setName(me.displayName);
      setBio(me.bio);
      setAvatar(me.avatar ?? null);
      setIsPrivate(me.isPrivate);
    }
  }, [me]);

  if (!me) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <SettingsIcon className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-bold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("misc.needLoginSub")}</p>
        <a href="#/login">
          <Button className="bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90">{t("a.login")}</Button>
        </a>
      </div>
    );
  }

  // Kirim kode verifikasi ke email milik akun ini
  async function sendPassCode() {
    if (!me?.email || sendingCode) return;
    try {
      setSendingCode(true);
      const res = await api.forgotPassword(me.email);
      setDevCode(res.devCode ?? null);
      setCodeSent(true);
      toast({ title: t("settings.passCodeOk") });
    } catch (err) {
      toast({ title: "Gagal mengirim kode", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSendingCode(false);
    }
  }

  // Ganti password: cukup kode email + password baru (tanpa password lama)
  async function savePassword() {
    if (!me?.email || !/^\d{6}$/.test(passCode) || newPass.length < 6 || changingPass) return;
    try {
      setChangingPass(true);
      await api.resetPassword(me.email, passCode, newPass);
      toast({ title: t("settings.passChanged") });
      // Bersihkan cache sesi supaya UI langsung kembali ke kondisi tamu
      // (menghindari "sesi hantu" yang otomatis mengarahkan lagi dari halaman login)
      qc.setQueryData(["me"], { user: null });
      api
        .logout()
        .catch(() => null)
        .finally(() => {
          window.location.hash = "#/login";
        });
    } catch (err) {
      toast({ title: "Gagal mengganti password", description: (err as Error).message, variant: "destructive" });
    } finally {
      setChangingPass(false);
    }
  }

  async function pickAvatar(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast({ title: "File harus berupa gambar" });
      return;
    }
    // Batas ukuran mengikuti jalur aktif: R2 (CDN) = 5GB, database = 60MB
    const caps = await uploadCaps();
    if (f.size > caps.image) {
      toast({ title: "Gambar terlalu besar", description: caps.r2 ? "Maksimal 5GB" : "Maksimal 60MB" });
      return;
    }
    // Buka dialog crop (zoom + geser) sebelum diunggah
    setCropFile(f);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function applyAvatarBlob(blob: Blob) {
    try {
      setUploading(true);
      setUploadPct(0);
      const uploaded = await api.upload(blob, "avatar.jpg", (pct) => setUploadPct(pct));
      if (uploaded.kind !== "IMAGE") throw new Error("Foto profil harus berupa gambar");
      pendingAvatarId.current = uploaded.mediaId;
      setAvatar(`/api/media/${uploaded.mediaId}`);
      toast({ title: "Foto siap disimpan", description: "Jangan lupa tekan Simpan perubahan di bawah." });
    } catch (err) {
      toast({ title: "Gagal mengunggah foto", description: (err as Error).message });
    } finally {
      setUploading(false);
      setCropFile(null);
    }
  }

  async function removeAvatar() {
    pendingAvatarId.current = null;
    setAvatar(null);
    updateMe.mutate({ avatarMediaId: null });
  }

  function saveProfile() {
    updateMe.mutate(
      {
        displayName: name.trim(),
        bio: bio.trim(),
        ...(pendingAvatarId.current ? { avatarMediaId: pendingAvatarId.current } : {}),
      },
      {
        onSuccess: () => {
          pendingAvatarId.current = null;
        },
      }
    );
  }

  function savePrivacy(value: boolean) {
    setIsPrivate(value);
    updateMe.mutate({ isPrivate: value });
  }

  return (
    <div className="mx-auto w-full max-w-[470px] space-y-4 px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="text-lg font-bold tracking-tight">{t("settings.title")}</h1>

      {/* Profil */}
      <Section title={t("settings.profile")}>
        {me.email && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("a.email")}</p>
            <p className="truncate text-sm font-medium">{me.email}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("a.emailHint")}</p>
          </div>
        )}
        <div className="flex items-center gap-4">
          <div className="relative">
            <UserAvatar name={me.displayName} color={me.avatarColor} avatar={avatar} size={72} ring />
            <Button
              size="icon"
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full border-2 border-background bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label={t("settings.changePhoto")}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => pickAvatar(e.target.files?.[0])}
              aria-label={t("settings.uploadPhoto")}
            />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-semibold">{t("settings.photo")}</p>
            <p className="text-xs text-muted-foreground">{t("settings.photoHint")}</p>
            {uploading && (
              <p className="text-xs font-medium text-rose-500">Mengunggah {uploadPct}%...</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {t("settings.changePhoto")}
              </Button>
              {avatar && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={removeAvatar}>
                  <Trash2 className="h-4 w-4" /> {t("settings.removePhoto")}
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-name">{t("settings.name")}</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-bio">{t("settings.bio")}</Label>
          <Textarea id="s-bio" value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-[80px] resize-none" maxLength={160} />
        </div>
        <Button
          onClick={saveProfile}
          disabled={updateMe.isPending || uploading || !name.trim()}
          className="w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
        >
          {updateMe.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("c.savechanges")}
        </Button>
      </Section>

      {/* Privasi */}
      <Section title={t("settings.privacy")}>
        <div className="flex items-start gap-3">
          <Switch checked={isPrivate} onCheckedChange={savePrivacy} id="private-switch" aria-label={t("settings.privateAccount")} />
          <div className="flex-1">
            <Label htmlFor="private-switch" className="flex items-center gap-1.5 text-sm font-semibold">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> {t("settings.privateAccount")}
            </Label>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {isPrivate ? t("settings.privateOn") : t("settings.privateOff")}
            </p>
          </div>
        </div>
      </Section>

      {/* Keamanan — ganti password lewat kode verifikasi email */}
      <Section title={t("settings.security")}>
        {!me.email ? (
          <p className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("settings.passNoEmail")}
          </p>
        ) : (
          <>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
              {t("settings.passViaCode")}
            </p>

            {/* Langkah 1: minta kode ke email */}
            {!codeSent ? (
              <Button variant="outline" className="w-full" onClick={sendPassCode} disabled={sendingCode}>
                {sendingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {t("settings.sendCode")}
              </Button>
            ) : (
              <>
                {/* Mode demo (email belum dikonfigurasi): kode tampil di layar */}
                {devCode && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center animate-pop-in">
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t("a.forgotDemo")}</p>
                    <p className="mt-1 text-2xl font-bold tracking-[0.3em] tabular-nums text-foreground">{devCode}</p>
                  </div>
                )}

                {/* Langkah 2: kode + password baru */}
                <div className="space-y-2">
                  <Label htmlFor="s-passcode">{t("a.forgotCodeLabel")}</Label>
                  <Input
                    id="s-passcode"
                    value={passCode}
                    onChange={(e) => setPassCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="000000"
                    className="text-center text-lg tracking-[0.3em]"
                    aria-label={t("a.forgotCodeLabel")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-newpass">{t("a.forgotNewPass")}</Label>
                  <Input id="s-newpass" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" />
                  <p className="text-xs text-muted-foreground">{t("settings.passHint")}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={sendPassCode} disabled={sendingCode} aria-label={t("settings.sendCode")}>
                    {sendingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t("a.forgotSend")}
                  </Button>
                  <Button
                    onClick={savePassword}
                    disabled={!/^\d{6}$/.test(passCode) || newPass.length < 6 || changingPass}
                    className="flex-1 bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
                  >
                    {changingPass && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("settings.changePass")}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Section>

      {/* Bahasa */}
      <Section title={t("settings.language")}>
        <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
          <SelectTrigger aria-label={t("settings.language")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGS.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.native} — {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      {/* Tampilan */}
      <Section title={t("settings.appearance")}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Moon className="h-4 w-4" aria-hidden="true" /> {t("settings.darkMode")}
          </div>
          <Switch
            checked={resolvedTheme === "dark"}
            onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
            aria-label={t("settings.darkMode")}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("settings.darkHint")}</p>
      </Section>

      {/* Sesi */}
      <Section title={t("settings.session")}>
        <p className="text-xs text-muted-foreground">{t("settings.logoutDesc")}</p>
        <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => logout.mutate()}>
          <LogOut className="h-4 w-4" /> {t("settings.logoutBtn")}
        </Button>
      </Section>
      {/* Dialog crop foto profil */}
      {cropFile && (
        <AvatarCropDialog
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(blob) => applyAvatarBlob(blob)}
        />
      )}
    </div>
  );
}
