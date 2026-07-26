import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignup = location.pathname.includes('signup');

  return (
    <div className="mp-auth-page">
      <div className="mp-auth-art" aria-hidden="true">
        <img src="/login-reference.jpg" alt="" />
      </div>
      <div className="mp-auth-vignette" aria-hidden="true" />

      <div className="mp-auth-frame">
        <main className="mp-auth-main">
          <div className="mp-auth-content">
            <div className="mp-auth-brand-row">
              {isSignup && (
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="mp-auth-back"
                  aria-label="Back to login"
                >
                  <ChevronLeft size={22} strokeWidth={2.2} />
                </button>
              )}

              <div className="mp-auth-brand" aria-label="Mysuru Paakashale">
                <div className="mp-auth-brand-name">MYSURU</div>
                <div className="mp-auth-brand-subname">PAAKASHALE</div>
                <div className="mp-auth-brand-tagline">
                  <span />
                  REAL TASTE OF NAMMURU
                  <span />
                </div>
              </div>
            </div>

            <div className="mp-auth-card">
              {children}
              <p className="mp-auth-legal">
                By continuing, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
