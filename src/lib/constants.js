export const BELTS = [
  { value: '흰띠', bg: '#FFFFFF', border: '#C9C6BB', text: '#20241F' },
  { value: '노란띠', bg: '#E8B923', border: '#B5900E', text: '#332600' },
  { value: '초록띠', bg: '#3C7A43', border: '#2A5A30', text: '#FFFFFF' },
  { value: '파란띠', bg: '#2B5C8A', border: '#1E4566', text: '#FFFFFF' },
  { value: '빨간띠', bg: '#9A2B2B', border: '#711F1F', text: '#FFFFFF' },
  { value: '검은띠', bg: '#1A1A1A', border: '#000000', text: '#FFFFFF' },
];

export const LEAD_SOURCES = ['전화', '방문', '온라인', '지인소개', '기타'];

export const LEAD_STATUSES = [
  { value: '신규문의', bg: '#F1EFE7', text: '#5B5F56', border: '#DEDACC' },
  { value: '상담예정', bg: '#E6F0F6', text: '#1E4566', border: '#B9D3E4' },
  { value: '상담완료', bg: '#FAEEDA', text: '#854F0B', border: '#F0D9A8' },
  { value: '등록완료', bg: '#E8F1E9', text: '#2A5A30', border: '#BFDCC3' },
  { value: '미등록', bg: '#FBEAEA', text: '#9A2B2B', border: '#E4B8B8' },
];

export const TRYOUT_STATUSES = [
  { value: '예정', bg: '#E6F0F6', text: '#1E4566', border: '#B9D3E4' },
  { value: '참석완료', bg: '#E8F1E9', text: '#2A5A30', border: '#BFDCC3' },
  { value: '노쇼', bg: '#FBEAEA', text: '#9A2B2B', border: '#E4B8B8' },
  { value: '등록전환', bg: '#FAEEDA', text: '#854F0B', border: '#F0D9A8' },
];

export const MAKEUP_STATUSES = {
  pending: { label: '미예약', bg: '#F1EFE7', text: '#5B5F56', border: '#DEDACC' },
  reserved: { label: '예약완료', bg: '#E6F0F6', text: '#1E4566', border: '#B9D3E4' },
  completed: { label: '수강완료', bg: '#E8F1E9', text: '#2A5A30', border: '#BFDCC3' },
  expired: { label: '만료', bg: '#FBEAEA', text: '#9A2B2B', border: '#E4B8B8' },
};

export function formatWon(n) {
  const num = Number(n);
  if (!num) return '0원';
  return num.toLocaleString('ko-KR') + '원';
}
