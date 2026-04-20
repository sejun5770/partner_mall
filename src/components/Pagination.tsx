"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const PAGE_GROUP_SIZE = 10;

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageGroup = Math.ceil(currentPage / PAGE_GROUP_SIZE);
  const startPage = (pageGroup - 1) * PAGE_GROUP_SIZE + 1;
  const endPage = Math.min(pageGroup * PAGE_GROUP_SIZE, totalPages);

  const pages: number[] = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  return (
    <nav
      role="navigation"
      aria-label="페이지 이동"
      className="flex items-center justify-center gap-1 py-2 text-sm"
    >
      <PageBtn
        onClick={() => onPageChange(1)}
        disabled={currentPage === 1}
        aria-label="첫 페이지"
      >
        «
      </PageBtn>
      <PageBtn
        onClick={() => onPageChange(startPage - 1)}
        disabled={startPage <= 1}
        aria-label="이전 그룹"
      >
        ‹
      </PageBtn>
      {pages.map((page) => {
        const active = page === currentPage;
        return (
          <PageBtn
            key={page}
            onClick={() => onPageChange(page)}
            active={active}
            aria-current={active ? "page" : undefined}
            aria-label={`${page}페이지`}
          >
            {page}
          </PageBtn>
        );
      })}
      <PageBtn
        onClick={() => onPageChange(endPage + 1)}
        disabled={endPage >= totalPages}
        aria-label="다음 그룹"
      >
        ›
      </PageBtn>
      <PageBtn
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages}
        aria-label="마지막 페이지"
      >
        »
      </PageBtn>
    </nav>
  );
}

function PageBtn({
  children,
  onClick,
  active,
  disabled,
  ...aria
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
}) {
  const base =
    "inline-flex h-8 min-w-8 items-center justify-center rounded border px-2 text-xs font-medium transition-colors";
  const state = active
    ? "border-indigo-600 bg-indigo-600 text-white"
    : disabled
    ? "border-slate-200 bg-white text-slate-300 cursor-not-allowed"
    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${state}`}
      {...aria}
    >
      {children}
    </button>
  );
}
