import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "바른손몰 B2B 지원 시스템 - 로그인",
};

// LoginForm reads useSearchParams() to honor ReturnUrl set by the middleware
// rewrite. That hook forces client-side rendering, so wrap in Suspense to
// satisfy Next's build-time CSR-bailout check.
export default function SignInPage() {
  return (
    <>
      <div className="container">
        <main role="main">
          <div className="intro">
            <div className="login">
              <div className="wrap">
                <div className="title">
                  <h2>바른손몰 B2B 지원시스템</h2>
                  <p>바른손몰 제휴 아이디로 로그인 해주세요.</p>
                </div>
                <Suspense fallback={null}>
                  <LoginForm />
                </Suspense>
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer>
        <p className="company">
          대표이사 : 박정식 | 사업자등록번호 : 221-81-03108 | 통신판매업신고 :
          2007-00940 <br />
          <span>
            본사 : 경기도 파주시 회동길 219 | 서울사옥 : 서울 용산구 장문로6길 19
          </span>
        </p>
        <p className="copyright">
          Copyright (주)바른컴퍼니 All Rights Reserved
        </p>
      </footer>
    </>
  );
}
