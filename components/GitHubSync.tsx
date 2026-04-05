import React, { useState, useEffect } from 'react';

interface GitHubSyncProps {
  currentCode: string;
}

const GitHubSync: React.FC<GitHubSyncProps> = ({ currentCode }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('github_token'));
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GITHUB_AUTH_SUCCESS') {
        const newToken = event.data.token;
        setToken(newToken);
        localStorage.setItem('github_token', newToken);
        setStatus('Connected to GitHub!');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnect = async () => {
    try {
      const response = await fetch('/api/auth/github/url');
      const { url } = await response.json();
      window.open(url, 'github_oauth', 'width=600,height=700');
    } catch (error) {
      console.error('Failed to get auth URL', error);
      setStatus('Failed to connect to GitHub');
    }
  };

  const handlePush = async () => {
    if (!token) return;
    setIsSyncing(true);
    setStatus('Collecting files...');
    setRepoUrl(null);

    try {
      // 1. Get all project files from server
      const filesRes = await fetch('/api/project-files');
      const { files } = await filesRes.json();

      // 2. Update App.tsx content with current editor code in the files list
      // This ensures the user's latest changes are pushed
      const updatedFiles = files.map((f: any) => {
        if (f.path === 'App.tsx' || f.path === 'src/App.tsx') {
          return { ...f, content: currentCode };
        }
        return f;
      });

      setStatus('Pushing to GitHub...');
      const pushRes = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          repoName: 'JAVASCRIPT-COMPILER',
          files: updatedFiles
        })
      });

      const result = await pushRes.json();
      if (result.success) {
        setStatus('Successfully pushed to GitHub!');
        setRepoUrl(result.url);
      } else {
        throw new Error(result.error || 'Push failed');
      }
    } catch (error: any) {
      console.error('Push error', error);
      setStatus(`Error: ${error.message}`);
      if (error.message.includes('Unauthorized')) {
        setToken(null);
        localStorage.removeItem('github_token');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {status && (
        <span className={`text-xs ${status.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
          {status}
        </span>
      )}
      
      {repoUrl && (
        <a 
          href={repoUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-blue-400 underline hover:text-blue-300"
        >
          View Repo
        </a>
      )}

      {!token ? (
        <button
          onClick={handleConnect}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Connect GitHub
        </button>
      ) : (
        <button
          onClick={handlePush}
          disabled={isSyncing}
          className={`${
            isSyncing ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'
          } text-white px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2`}
        >
          {isSyncing ? (
            <>
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Syncing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Sync to GitHub
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default GitHubSync;
