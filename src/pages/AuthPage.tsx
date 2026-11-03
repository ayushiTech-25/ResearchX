import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { api } from "../services/api";
import { useToast } from "../components/Toast";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const registering = mode === "register";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useToast();
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const mutation = useMutation({
    mutationFn: () => registering ? api.register(name, email, password) : api.login(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth", "me"], data);
      notify(registering ? "Your account is ready." : "Welcome back.");
      navigate("/dashboard");
    },
    onError: (error: Error) => setFormError(error.message),
  });

  if (me.data?.user) return <Navigate to="/dashboard" replace />;
  return <div className="auth-form-wrap">
    <div className="auth-mobile-brand"><div className="brand-mark"><LockKeyhole size={18} /></div><span className="brand-name">Research<span>X</span></span></div>
    <div className="auth-form-heading"><div className="auth-overline">{registering ? "START YOUR RESEARCH JOURNEY" : "WELCOME BACK"}</div><h1>{registering ? "Create your account" : "Sign in to ResearchX"}</h1><p>{registering ? "Build a focused workspace for your research." : "Pick up where your curiosity left off."}</p></div>
    <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setFormError(""); mutation.mutate(); }}>
      {registering && <label className="field-label">Full name<div className="input-wrap"><UserRound size={17} /><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" required minLength={2} maxLength={80} /></div></label>}
      <label className="field-label">Email address<div className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" required /></div></label>
      <label className="field-label">Password<div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? "text" : "password"} autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={registering ? "At least 10 characters" : "Enter your password"} required minLength={registering ? 10 : 1} maxLength={128} /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <button className="primary-button auth-submit" type="submit" disabled={mutation.isPending}>{mutation.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <>{registering ? "Create account" : "Sign in"} <ArrowRight size={17} /></>}</button>
    </form>
    <p className="auth-switch">{registering ? "Already have an account?" : "New to ResearchX?"} <Link to={registering ? "/login" : "/register"}>{registering ? "Sign in" : "Create an account"}</Link></p>
    <div className="auth-terms">By continuing, you agree to use ResearchX responsibly and respect scholarly attribution.</div>
  </div>;
}
