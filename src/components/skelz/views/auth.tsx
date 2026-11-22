"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, LogIn, Mail, ShieldCheck, UserPlus, Zap, CheckCircle2, ArrowLeft, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useLogin, useLoginVerify, useRegister } from "../hooks";
import { SkelzLogo } from "../logo";

function Feature() {
  const t = useT();
  const items = [t("a.f1"), t("a.f2"), t("a.f3"), t("a.f4"), t("a.f5")];
  return (
    <ul className="space-y-2.5 text-sm text-muted-foreground">
      {items.map((text) => (
        <li key={text} className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-rose-500" /> {text}
        </li>
      ))}
    </ul>
  );
}

// ---------- Lupa password (kode verifikasi email) ----------

function ForgotPasswordDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;
    try {
      setLoading(true);
      const res = await api.forgotPassword(email.trim());
      if (res.message === "kalau-email-terdaftar") {
        // Jangan bocorkan keberadaan email — perlakukan sama seperti sukses
        toast({ title: t("a.forgotSent") });
        setDevCode(null);
      } else {
        toast({ title: t("a.forgotSent") });
        setDevCode(res.devCode ?? null);
      }
      setStep("code");
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code) || newPassword.length < 6 || loading) return;
    try {
      setLoading(true);
      await api.resetPassword(email.trim(), code, newPassword);
      setDone(true);
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-t-2xl border bg-card p-5 shadow-xl sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/15 to-orange-400/15">
            <KeyRound className="h-5 w-5 text-rose-500" />
          </span>
          <div className="flex-1">
            <h2 className="text-base font-bold leading-tight">{t("a.forgotTitle")}</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label={t("c.cancel")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </span>
            <p className="text-sm font-medium">{t("a.forgotOk")}</p>
            <Button className="w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90" onClick={onClose}>
              {t("a.forgotBack")}
            </Button>
          </div>
        ) : step === "email" ? (
          <form onSubmit={requestCode} className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("a.forgotDesc")}</p>
            <div className="space-y-2">
              <Label htmlFor="fp-email">{t("a.email")}</Label>
              <Input
                id="fp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("a.emailPlaceholder")}
                autoComplete="email"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90" disabled={loading || !email.trim()}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} {t("a.forgotSend")}
            </Button>
          </form>
        ) : (
          <form onSubmit={doReset} className="space-y-4">
            {devCode && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t("a.forgotDemo")}</p>
                <p className="mt-1 text-2xl font-bold tracking-[0.3em] tabular-nums text-foreground">{devCode}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="fp-code">{t("a.forgotCodeLabel")}</Label>
              <Input
                id="fp-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                className="text-center text-lg tracking-[0.3em]"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fp-pass">{t("a.forgotNewPass")}</Label>
              <Input
                id="fp-pass"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90" disabled={loading || !/^\d{6}$/.test(code) || newPassword.length < 6}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} {t("a.forgotResetBtn")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------- View auth utama ----------

type CodeChallenge = { userId: string; email: string; devCode?: string };

const RESEND_COOLDOWN = 30; // detik

export function AuthView({ mode }: { mode: "login" | "register" }) {
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);

  // Login 2FA: langkah kode verifikasi email
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  function finishLogin(me: { displayName: string }) {
    toast({ title: `${t("a.welcomeBack")}, ${me.displayName}!` });
    window.location.hash = "#/";
  }

  const login = useLogin(
    (me) => finishLogin(me),
    (c) => {
      setChallenge(c);
      setCode("");
      setAttempt((n) => n + 1);
      setResendIn(RESEND_COOLDOWN);
      toast({ title: t("a.forgotSent") });
    }
  );

  const loginVerify = useLoginVerify((me) => {
    setChallenge(null);
    finishLogin(me);
  });

  const register = useRegister((me) => {
    toast({ title: `${t("a.regOk")} — ${me.displayName}`, description: t("a.regOkSub") });
    window.location.hash = "#/create";
  });

  useEffect(() => {
    document.title = mode === "login" ? `${t("a.login")} · SkelzHub` : `${t("a.register")} · SkelzHub`;
  }, [mode, t]);

  // Fokus & hitung mundur kirim-ulang kode (reset tiap kode baru dikirim)
  useEffect(() => {
    if (!challenge) return;
    codeInputRef.current?.focus();
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [challenge, attempt, resendIn]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    login.mutate({ username: username.trim(), password });
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge || !/^\d{6}$/.test(code) || loginVerify.isPending) return;
    loginVerify.mutate({ userId: challenge.userId, code });
  }

  function handleResend() {
    if (!challenge || resendIn > 0 || login.isPending) return;
    login.mutate({ username: username.trim(), password });
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || password.length < 6) return;
    register.mutate({ username: username.trim(), displayName: displayName.trim(), email: email.trim().toLowerCase(), password });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 text-white shadow-md">
          <Zap className="h-7 w-7" strokeWidth={2.5} />
        </div>
        <div className="flex justify-center">
          <SkelzLogo />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("a.hero")}</p>
      </div>

      <Tabs defaultValue={mode} key={mode}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">
            <LogIn className="mr-1.5 h-4 w-4" /> {t("a.login")}
          </TabsTrigger>
          <TabsTrigger value="register">
            <UserPlus className="mr-1.5 h-4 w-4" /> {t("a.register")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="login" className="mt-4">
          {challenge ? (
            /* ---------- Langkah 2: kode verifikasi email ---------- */
            <form onSubmit={handleVerify} className="space-y-4 rounded-xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500/15 to-orange-400/15">
                  <Mail className="h-5 w-5 text-rose-500" />
                </span>
                <div>
                  <h2 className="text-base font-bold leading-tight">{t("a.codeTitle")}</h2>
                  <p className="text-xs text-muted-foreground">{t("a.loginSub")}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{t("a.codeDesc").replace("{email}", challenge.email)}</p>

              {challenge.devCode && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t("a.forgotDemo")}</p>
                  <p className="mt-1 text-2xl font-bold tracking-[0.3em] tabular-nums text-foreground">{challenge.devCode}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="login-code">{t("a.codeLabel")}</Label>
                <Input
                  id="login-code"
                  ref={codeInputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.3em]"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
                disabled={loginVerify.isPending || !/^\d{6}$/.test(code)}
              >
                {loginVerify.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t("a.verifyBtn")}
              </Button>

              <div className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  className="font-medium text-rose-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
                  onClick={handleResend}
                  disabled={resendIn > 0 || login.isPending}
                >
                  {resendIn > 0 ? t("a.resendIn").replace("{s}", String(resendIn)) : t("a.resendCode")}
                </button>
                <button
                  type="button"
                  className="font-medium text-muted-foreground hover:underline"
                  onClick={() => {
                    setChallenge(null);
                    setCode("");
                  }}
                >
                  {t("a.useOtherAccount")}
                </button>
              </div>
            </form>
          ) : (
            /* ---------- Langkah 1: username + password ---------- */
            <form onSubmit={handleLogin} className="space-y-4 rounded-xl border bg-card p-5">
              <div className="space-y-2">
                <Label htmlFor="login-username">{t("a.usernameOrEmail")}</Label>
                <Input
                  id="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("a.usernameOrEmailPh")}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">{t("a.password")}</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("a.passwordPh")}
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
                disabled={login.isPending || !username.trim() || !password}
              >
                {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t("a.login")}
              </Button>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                {t("a.f5")}
              </p>
              <div className="flex items-center justify-between gap-2 text-xs">
                <button type="button" className="font-medium text-rose-500 hover:underline" onClick={() => setForgotOpen(true)}>
                  {t("a.forgot")}
                </button>
                <span className="text-muted-foreground">
                  {t("a.noAccount")}{" "}
                  <a href="#/register" className="font-medium text-foreground hover:underline">
                    {t("a.register")}
                  </a>
                </span>
              </div>
            </form>
          )}
        </TabsContent>

        <TabsContent value="register" className="mt-4">
          <form onSubmit={handleRegister} className="space-y-4 rounded-xl border bg-card p-5">
            <div className="space-y-2">
              <Label htmlFor="reg-name">{t("a.displayName")}</Label>
              <Input
                id="reg-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("a.displayNamePh")}
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-username">{t("a.username")}</Label>
              <Input
                id="reg-username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder={t("a.usernamePh")}
                autoComplete="username"
                required
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("a.usernameHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {t("a.email")}
              </Label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("a.emailPlaceholder")}
                autoComplete="email"
                required
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("a.emailHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">{t("a.password")}</Label>
              <Input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("a.newPasswordPh")}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white hover:opacity-90"
              disabled={register.isPending || !username.trim() || !email.trim() || password.length < 6}
            >
              {register.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t("a.createAccount")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t("a.registerSub")}</p>
          </form>
        </TabsContent>
      </Tabs>

      <div className="rounded-xl border bg-card p-5">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-rose-500" aria-hidden="true" /> {t("a.why")}
        </p>
        <Feature />
      </div>

      {forgotOpen && <ForgotPasswordDialog onClose={() => setForgotOpen(false)} />}
    </div>
  );
}
