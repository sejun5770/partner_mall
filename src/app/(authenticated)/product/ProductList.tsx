"use client";

import { useState, useEffect, useCallback } from "react";
import Pagination from "@/components/Pagination";

interface Product {
  Card_Seq: number;
  Card_Code: string;
  Card_Name: string;
  CardBrand: string;
  Card_Div: string;
  Card_Price: number;
  CardSet_Price: number | null;
  DISPLAY_YORN: string;
  Card_Image: string;
  RegDate: string;
}

interface ProductResponse {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
}

const BRAND_NAMES: Record<string, string> = {
  B: "바른손카드",
  S: "비핸즈",
  C: "더카드",
  X: "디어디어",
  W: "W카드",
  N: "네이처",
  I: "이니스",
  H: "비핸즈 프리미엄",
  F: "플라워",
  D: "디자인카드",
  P: "프리미어",
  M: "모바일",
  G: "글로벌",
};

const CARD_DIVS: Record<string, string> = {
  A01: "청첩장",
  A02: "봉투",
  A03: "감사장",
  A04: "스티커",
  A05: "식권",
  B01: "포토북",
};

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  const [cardCode, setCardCode] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardBrand, setCardBrand] = useState("");
  const [cardDiv, setCardDiv] = useState("");
  const [displayYorn, setDisplayYorn] = useState("");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (cardCode) params.set("cardCode", cardCode);
    if (cardName) params.set("cardName", cardName);
    if (cardBrand) params.set("cardBrand", cardBrand);
    if (cardDiv) params.set("cardDiv", cardDiv);
    if (displayYorn) params.set("displayYorn", displayYorn);

    try {
      const res = await fetch(`/api/products?${params}`);
      const data: ProductResponse = await res.json();
      setProducts(data.products);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [page, pageSize, cardCode, cardName, cardBrand, cardDiv, displayYorn]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <div className="form_wrap">
        <form onSubmit={handleSearch}>
          <table>
            <tbody>
              <tr>
                <th>상품코드</th>
                <td>
                  <input type="text" value={cardCode} onChange={(e) => setCardCode(e.target.value)} placeholder="상품코드 입력" />
                </td>
                <th>상품명</th>
                <td>
                  <input type="text" value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="상품명 입력" />
                </td>
              </tr>
              <tr>
                <th>브랜드</th>
                <td>
                  <select value={cardBrand} onChange={(e) => setCardBrand(e.target.value)}>
                    <option value="">전체</option>
                    {Object.entries(BRAND_NAMES).map(([key, name]) => (
                      <option key={key} value={key}>{name}</option>
                    ))}
                  </select>
                </td>
                <th>카테고리</th>
                <td>
                  <select value={cardDiv} onChange={(e) => setCardDiv(e.target.value)}>
                    <option value="">전체</option>
                    {Object.entries(CARD_DIVS).map(([key, name]) => (
                      <option key={key} value={key}>{name}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <th>전시여부</th>
                <td colSpan={3}>
                  <div className="radio_box">
                    <input type="radio" name="display" value="" checked={displayYorn === ""} onChange={() => setDisplayYorn("")} id="displayAll" />
                    <label htmlFor="displayAll">전체</label>
                  </div>
                  <div className="radio_box">
                    <input type="radio" name="display" value="Y" checked={displayYorn === "Y"} onChange={() => setDisplayYorn("Y")} id="displayY" />
                    <label htmlFor="displayY">전시</label>
                  </div>
                  <div className="radio_box">
                    <input type="radio" name="display" value="N" checked={displayYorn === "N"} onChange={() => setDisplayYorn("N")} id="displayN" />
                    <label htmlFor="displayN">미전시</label>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="btn_wrap">
            <button type="submit" className="btn purple2">검색</button>
            <button type="button" className="btn grey" onClick={() => {
              setCardCode(""); setCardName(""); setCardBrand(""); setCardDiv(""); setDisplayYorn("");
            }}>초기화</button>
          </div>
        </form>
      </div>

      <div className="form_wrap table_list">
        <div className="btn_wrap">
          <span style={{ marginRight: "8px" }}>
            총 <span style={{ color: "#f00", fontWeight: 600 }}>{total.toLocaleString()}</span>건
          </span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            <option value={20}>20개씩</option>
            <option value={50}>50개씩</option>
            <option value={100}>100개씩</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>이미지</th>
              <th>상품코드</th>
              <th>상품명</th>
              <th>브랜드</th>
              <th>카테고리</th>
              <th>단가</th>
              <th>세트가</th>
              <th>전시여부</th>
              <th>등록일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: "40px" }}>로딩 중...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: "40px" }}>조회된 상품이 없습니다.</td></tr>
            ) : (
              products.map((p, idx) => (
                <tr key={p.Card_Seq}>
                  <td>{total - (page - 1) * pageSize - idx}</td>
                  <td>
                    {p.Card_Image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://static.barunsoncard.com${p.Card_Image}`}
                        alt={p.Card_Name || p.Card_Code}
                        style={{ width: "100px", height: "50px", objectFit: "cover", margin: "0 auto" }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : "-"}
                  </td>
                  <td>{p.Card_Code}</td>
                  <td style={{ textAlign: "left", paddingLeft: "16px" }}>{p.Card_Name || "-"}</td>
                  <td>{BRAND_NAMES[p.CardBrand] || p.CardBrand}</td>
                  <td>{CARD_DIVS[p.Card_Div] || p.Card_Div}</td>
                  <td>{p.Card_Price?.toLocaleString()}원</td>
                  <td>{p.CardSet_Price ? `${p.CardSet_Price.toLocaleString()}원` : "-"}</td>
                  <td>
                    <span style={{ color: p.DISPLAY_YORN === "Y" ? "#268652" : "#999" }}>
                      {p.DISPLAY_YORN === "Y" ? "전시" : "미전시"}
                    </span>
                  </td>
                  <td>{p.RegDate ? new Date(p.RegDate).toLocaleDateString("ko-KR") : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </>
  );
}
