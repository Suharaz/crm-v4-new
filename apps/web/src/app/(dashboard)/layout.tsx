import { getCurrentUser } from '@/lib/auth';
import { AuthProvider } from '@/providers/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { MobileSidebarProvider } from '@/components/layout/mobile-sidebar-provider';

/** Dashboard layout: responsive sidebar + header + main content. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <AuthProvider initialUser={user}>
      <MobileSidebarProvider>
        <div className="flex h-dvh overflow-hidden">
          <AppSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <AppHeader />
            <main className="flex-1 overflow-auto bg-slate-50 p-4 sm:p-6">
              {children}
            </main>
          </div>
        </div>
      </MobileSidebarProvider>
    </AuthProvider>
  );
}
