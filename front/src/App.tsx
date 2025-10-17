import React from 'react';
// GifOptimizer 컴포넌트를 임포트합니다.
// 이 파일은 같은 src 폴더 내에 있다고 가정합니다.
import GifOptimizer from './GifOptimizer';

/**
 * 메인 애플리케이션 컴포넌트입니다.
 * 여기서는 GIF 최적화 도구를 렌더링합니다.
 */
const App: React.FC = () => {
  return (
    // Tailwind CSS나 다른 글로벌 스타일링이 없다면,
    // 간단한 div 컨테이너를 사용합니다.
    <div className="App">
      <GifOptimizer />
    </div>
  );
};

export default App;