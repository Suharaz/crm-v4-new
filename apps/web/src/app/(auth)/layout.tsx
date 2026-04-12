/** Auth layout: centered card, no sidebar. Corporate Trust atmospheric bg. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4">
      {/* Atmospheric blur orbs */}
      <div className="blur-orb -left-32 -top-32 h-96 w-96 bg-sky-200 opacity-30" />
      <div className="blur-orb -bottom-24 -right-24 h-80 w-80 bg-cyan-200 opacity-25" />
      <div className="blur-orb left-1/3 top-2/3 h-64 w-64 bg-sky-100 opacity-20" />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
