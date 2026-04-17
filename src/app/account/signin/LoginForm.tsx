"use client";

import { useState, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [idFocused, setIdFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [error, setError] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!loginId) {
      setError("아이디를 입력해주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    try {
      const res = await fetch("/api/account/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loginId, password }),
      });

      if (res.ok) {
        router.push("/");
      } else {
        const data = await res.json();
        setError(data.message || "로그인에 실패했습니다.");
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    }
  };

  return (
    <div className="login_form">
      <div className="form_wrap">
        <form method="post" onSubmit={handleSubmit}>
          <div className="ip">
            <div className="input_form id_box">
              <label htmlFor="loginId">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    idFocused
                      ? "https://static.barunsoncard.com/barunsonmall/admin/images/ico_id_bk.svg"
                      : "https://static.barunsoncard.com/barunsonmall/admin/images/ico_id.svg"
                  }
                  alt="ID 아이콘 이미지"
                  id="iconId"
                />
                <input
                  placeholder="ID를 입력하세요"
                  id="loginId"
                  required
                  type="text"
                  name="Id"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  onFocus={() => setIdFocused(true)}
                  onBlur={() => setIdFocused(false)}
                />
              </label>
            </div>
            <div className="input_form pw_box">
              <label htmlFor="loginPw">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    pwFocused
                      ? "https://static.barunsoncard.com/barunsonmall/admin/images/ico_pw_bk.svg"
                      : "https://static.barunsoncard.com/barunsonmall/admin/images/ico_pw.svg"
                  }
                  alt="PW 아이콘 이미지"
                  id="iconPw"
                />
                <input
                  placeholder="비밀번호를 입력하세요"
                  id="loginPw"
                  required
                  type="password"
                  name="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPwFocused(true)}
                  onBlur={() => setPwFocused(false)}
                />
              </label>
            </div>
          </div>

          <div className="error">
            {error && (
              <p className="msg" style={{ display: "block" }}>
                {error}
              </p>
            )}
          </div>

          <button type="submit" className="login_btn">
            로그인
          </button>
        </form>
      </div>
      <div className="inquiry">
        <p>시스템 및 로그인 문의 : developer@barunn.net</p>
        <p>전화상담 : 1644-7413</p>
      </div>
    </div>
  );
}
