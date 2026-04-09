'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';

interface Props {
  initialCallPrompt: string;
  initialCustomerPrompt: string;
}

/** Settings tab for AI analysis prompts (SUPER_ADMIN only). */
export function AiPromptSettings({ initialCallPrompt, initialCustomerPrompt }: Props) {
  const [callPrompt, setCallPrompt] = useState(initialCallPrompt);
  const [customerPrompt, setCustomerPrompt] = useState(initialCustomerPrompt);
  const [saving, setSaving] = useState<string | null>(null);

  async function save(key: string, value: string, label: string) {
    setSaving(key);
    try {
      await api.put(`/system-settings/${key}`, { value });
      toast.success(`Đã lưu ${label}`);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi lưu');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6 mt-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Prompt phân tích cuộc gọi</h3>
        <p className="text-xs text-gray-500">
          Prompt này được gửi đến AI khi phân tích cuộc gọi dài hơn 1 phút. Nội dung cuộc gọi sẽ được đính kèm tự động.
        </p>
        <Textarea
          value={callPrompt}
          onChange={e => setCallPrompt(e.target.value)}
          rows={5}
          placeholder="VD: Hãy tóm tắt nội dung cuộc gọi, nhu cầu khách hàng, và hành động tiếp theo..."
        />
        <Button
          size="sm"
          disabled={saving === 'ai_call_analysis_prompt'}
          onClick={() => save('ai_call_analysis_prompt', callPrompt, 'prompt cuộc gọi')}
        >
          {saving === 'ai_call_analysis_prompt' ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Prompt phân tích khách hàng</h3>
        <p className="text-xs text-gray-500">
          Prompt này được gửi khi phân tích tổng quan khách hàng (cuộc gọi dài hơn 2 phút hoặc bấm nút phân tích).
          Dữ liệu ghi chú, thanh toán, phân tích cuộc gọi sẽ được đính kèm tự động.
          Kết quả luôn trả về gồm mô tả ngắn + phân tích chi tiết.
        </p>
        <Textarea
          value={customerPrompt}
          onChange={e => setCustomerPrompt(e.target.value)}
          rows={5}
          placeholder="VD: Đánh giá mức độ tiềm năng, hành vi mua, rủi ro mất KH, đề xuất hành động..."
        />
        <Button
          size="sm"
          disabled={saving === 'ai_customer_analysis_prompt'}
          onClick={() => save('ai_customer_analysis_prompt', customerPrompt, 'prompt khách hàng')}
        >
          {saving === 'ai_customer_analysis_prompt' ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </div>
    </div>
  );
}
