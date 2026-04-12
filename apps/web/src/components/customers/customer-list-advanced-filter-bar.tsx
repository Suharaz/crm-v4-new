'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';

const STATUSES = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngưng hoạt động' },
  { value: 'FLOATING', label: 'Thả nổi' },
];

interface FilterBarProps {
  departments: { id: string; name: string }[];
  users: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
}

const STORAGE_KEY = 'crm_customer_filters';

/** Advanced filter bar for customers list — URL-based state (shareable). */
export function CustomerListAdvancedFilterBar({ departments, users, labels }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const [restored, setRestored] = useState(false);

  // Restore filters from localStorage if URL has no params
  useEffect(() => {
    if (restored) return;
    setRestored(true);
    if (searchParams.toString()) {
      localStorage.setItem(STORAGE_KEY, searchParams.toString());
    } else {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) router.replace(`${pathname}?${saved}`);
    }
  }, [restored, searchParams, pathname, router]);

  const currentSearch = searchParams.get('search') || '';
  const currentStatus = searchParams.get('status') || '';
  const currentDepartmentId = searchParams.get('departmentId') || '';
  const currentAssignedUserId = searchParams.get('assignedUserId') || '';
  const currentLabelId = searchParams.get('labelId') || '';
  const currentDateFrom = searchParams.get('dateFrom') || '';
  const currentDateTo = searchParams.get('dateTo') || '';

  const activeFilterCount = [currentStatus, currentDepartmentId, currentAssignedUserId, currentLabelId, currentDateFrom, currentDateTo].filter(Boolean).length;

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) { params.set(key, value); } else { params.delete(key); }
    params.delete('cursor');
    const qs = params.toString();
    localStorage.setItem(STORAGE_KEY, qs);
    router.push(`${pathname}?${qs}`);
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    router.push(pathname);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      {/* Search + toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            defaultValue={currentSearch}
            placeholder="Tìm theo tên, SĐT, email..."
            onKeyDown={e => { if (e.key === 'Enter') updateFilter('search', (e.target as HTMLInputElement).value); }}
            onBlur={e => { if (e.target.value !== currentSearch) updateFilter('search', e.target.value); }}
            className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <Button size="sm" variant={expanded ? 'default' : 'outline'} onClick={() => setExpanded(!expanded)}>
          <Filter className="h-4 w-4 mr-1" />
          Bộ lọc
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-indigo-200 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">{activeFilterCount}</span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
        </Button>
        {activeFilterCount > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}><X className="h-4 w-4 mr-1" />Xóa lọc</Button>
        )}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 pt-2 border-t border-slate-100">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Trạng thái</label>
            <Select value={currentStatus} onValueChange={v => updateFilter('status', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Phòng ban</label>
            <Select value={currentDepartmentId} onValueChange={v => updateFilter('departmentId', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Nhân viên</label>
            <Select value={currentAssignedUserId} onValueChange={v => updateFilter('assignedUserId', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Nhãn</label>
            <Select value={currentLabelId} onValueChange={v => updateFilter('labelId', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {labels.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: l.color }} />{l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Từ ngày</label>
            <input type="date" value={currentDateFrom} onChange={e => updateFilter('dateFrom', e.target.value)}
              className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Đến ngày</label>
            <input type="date" value={currentDateTo} onChange={e => updateFilter('dateTo', e.target.value)}
              className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
      )}
    </div>
  );
}
