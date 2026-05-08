'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserForm } from '@/components/users/user-form';
import { UserPhonesPanel } from '@/components/user-phones/user-phones-panel';
import type { UserRecord, NamedEntity } from '@/types/entities';

interface Props {
  user: UserRecord;
  departments: NamedEntity[];
  levels: NamedEntity[];
  /** Chỉ super_admin mới thấy tab "SĐT phụ trách" */
  showPhonesTab: boolean;
  allUsers: UserRecord[];
}

export function UserEditTabs({ user, departments, levels, showPhonesTab, allUsers }: Props) {
  if (!showPhonesTab) {
    return <UserForm user={user} departments={departments} levels={levels} />;
  }

  return (
    <Tabs defaultValue="info" className="w-full">
      <TabsList>
        <TabsTrigger value="info">Thông tin chung</TabsTrigger>
        <TabsTrigger value="phones">SĐT phụ trách</TabsTrigger>
      </TabsList>
      <TabsContent value="info">
        <UserForm user={user} departments={departments} levels={levels} />
      </TabsContent>
      <TabsContent value="phones">
        <UserPhonesPanel userId={String(user.id)} userName={user.name} allUsers={allUsers} />
      </TabsContent>
    </Tabs>
  );
}
