"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { getSupabaseBrowserClient } from "../../features/auth/supabase";

type AuthMode = "signin" | "signup";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nextPath = searchParams.get("next") ?? "/workbench";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const response =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (response.error) {
        setErrorMessage(response.error.message);
        return;
      }

      if (mode === "signup" && !response.data.session) {
        setStatusMessage("账号已创建，请按邮箱中的确认链接完成验证。");
        return;
      }

      router.replace(nextPath);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "登录服务暂时不可用。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <Link href="/" className="auth-logo">
          概念树工作台
        </Link>
        <div className="auth-copy">
          <p>进入工作台</p>
          <h1 id="auth-title">
            {mode === "signin" ? "登录账号" : "创建账号"}
          </h1>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="登录方式">
          <button
            type="button"
            className={mode === "signin" ? "is-active" : ""}
            onClick={() => {
              setMode("signin");
              setErrorMessage(null);
              setStatusMessage(null);
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === "signup" ? "is-active" : ""}
            onClick={() => {
              setMode("signup");
              setErrorMessage(null);
              setStatusMessage(null);
            }}
          >
            创建账号
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>

          {errorMessage ? <p className="auth-message auth-message--error">{errorMessage}</p> : null}
          {statusMessage ? <p className="auth-message">{statusMessage}</p> : null}

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting
              ? "处理中"
              : mode === "signin"
                ? "登录"
                : "创建账号"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-page">
          <section className="auth-panel">
            <p>正在加载登录表单。</p>
          </section>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
