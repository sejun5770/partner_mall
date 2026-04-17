"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageGroup = Math.ceil(currentPage / 10);
  const startPage = (pageGroup - 1) * 10 + 1;
  const endPage = Math.min(pageGroup * 10, totalPages);

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <ul className="pagination">
      {startPage > 1 && (
        <li>
          <a href="#" onClick={(e) => { e.preventDefault(); onPageChange(startPage - 1); }}>
            &laquo;
          </a>
        </li>
      )}
      {pages.map((page) => (
        <li key={page} className={`number ${page === currentPage ? "active" : ""}`}>
          <a href="#" onClick={(e) => { e.preventDefault(); onPageChange(page); }}>
            {page}
          </a>
        </li>
      ))}
      {endPage < totalPages && (
        <li>
          <a href="#" onClick={(e) => { e.preventDefault(); onPageChange(endPage + 1); }}>
            &raquo;
          </a>
        </li>
      )}
    </ul>
  );
}
