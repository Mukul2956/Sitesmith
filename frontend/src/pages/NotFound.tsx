import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background-secondary to-background-tertiary">
      <div className="text-center">
        <div className="glass-strong rounded-2xl p-8 max-w-md mx-auto">
          <h1 className="mb-4 text-6xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">404</h1>
          <p className="mb-6 text-xl text-foreground">Oops! Page not found</p>
          <a href="/" className="btn-neon inline-flex items-center gap-2">
            Return to Home
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
