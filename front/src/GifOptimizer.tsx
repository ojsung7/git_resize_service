import React, { 
    useState, 
    useCallback, 
    useMemo,
    useEffect
} from 'react';
import type { 
    ChangeEvent, 
    MouseEvent 
} from 'react';

// 외부 CSS 파일 임포트
import './GifOptimizer.css'; 

// ------------------- 타입 정의 -------------------
interface OptimizationSettings {
    lossy: number;
    colors: number;
}

// 개별 파일의 상태를 담는 구조체
interface GifFileState {
    id: number; 
    file: File;
    originalUrl: string;
    originalSize: number;
    
    optimizedUrl: string;
    optimizedSize: number;
    reductionRate: number;

    isProcessing: boolean; // 전체 요청 중임을 표시하기 위해 사용
    error: string;
}

// 서버 응답 타입 정의
interface OptimizationResult {
    filename: string;
    original_size: number;
    optimized_data: string | null; // Base64 문자열
    optimized_size: number | null;
    error: string | null;
}

interface ServerResponse {
    results: OptimizationResult[];
}

// ------------------- 유틸리티 함수 -------------------
/**
 * 바이트 크기를 KB 또는 MB로 포맷팅합니다.
 * @param bytes 바이트 수
 * @param decimals 소수점 자릿수
 */
const formatBytes = (bytes: number, decimals: number = 2): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Base64 문자열을 Blob 객체로 변환합니다.
 * @param b64Data Base64 인코딩된 문자열
 * @param contentType MIME 타입
 */
const b64toBlob = (b64Data: string, contentType: string = 'image/gif'): Blob => {
    // Base64 문자열에서 데이터 부분만 추출
    const byteCharacters = atob(b64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
};


// ------------------- 메인 컴포넌트 -------------------
const GifOptimizer: React.FC = () => {
    // === 상태 관리 ===
    const [files, setFiles] = useState<GifFileState[]>([]); 

    const [settings, setSettings] = useState<OptimizationSettings>({
        lossy: 200, 
        colors: 64, 
    });
    
    const [isOptimizing, setIsOptimizing] = useState<boolean>(false); 
    const [globalError, setGlobalError] = useState<string>(''); 
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false); 

    // === 테마 관리 및 클린업 로직 ===
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialDarkMode = savedTheme === 'dark' || (savedTheme === null && prefersDark);
        
        if (initialDarkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        setIsDarkMode(initialDarkMode);

        // Cleanup function for object URLs to prevent memory leaks
        return () => {
            files.forEach(fileState => {
                URL.revokeObjectURL(fileState.originalUrl);
                if (fileState.optimizedUrl) URL.revokeObjectURL(fileState.optimizedUrl);
            });
        };
    }, [files]); 

    const handleThemeToggle = useCallback(() => {
        setIsDarkMode(prev => {
            const newMode = !prev;
            if (newMode) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('theme', 'light');
            }
            return newMode;
        });
    }, []);
    
    // === 이벤트 핸들러 ===
    const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files || []);
        
        // 이전 URL 해제 및 상태 초기화 로직
        setFiles(prevFiles => {
            prevFiles.forEach(item => {
                URL.revokeObjectURL(item.originalUrl);
                if (item.optimizedUrl) URL.revokeObjectURL(item.optimizedUrl);
            });
            return []; // 새 파일을 받을 때 기존 목록 초기화
        });
        
        setGlobalError('');

        const newFileStates: GifFileState[] = [];
        let errorCount = 0;

        selectedFiles.forEach((file, index) => {
            if (file.type === 'image/gif') {
                const url = URL.createObjectURL(file);
                newFileStates.push({
                    id: Date.now() + index, // 고유 ID 생성
                    file: file,
                    originalUrl: url,
                    originalSize: file.size,
                    optimizedUrl: '',
                    optimizedSize: 0,
                    reductionRate: 0,
                    isProcessing: false,
                    error: '',
                });
            } else {
                errorCount++;
            }
        });
        
        setFiles(newFileStates);

        if (errorCount > 0) {
            setGlobalError(`🚨 ${errorCount}개의 파일은 GIF 형식이 아니어서 제외되었습니다.`); 
        }

        event.target.value = '';

    }, []);


    const handleSettingChange = useCallback((name: keyof OptimizationSettings, min: number, max: number) => (
        (event: ChangeEvent<HTMLInputElement>) => {
            let value = parseInt(event.target.value) || min;
            value = Math.max(min, Math.min(max, value));
            
            setSettings(prev => ({ ...prev, [name]: value }));
        }
    ), []);

    // ⭐ 3. 최적화 실행 핸들러 (전체 파일을 한 번에 요청 및 JSON 응답 처리)
    const handleOptimizeAll = useCallback(async () => {
        if (files.length === 0) {
            setGlobalError('먼저 GIF 파일을 업로드해주세요.');
            return;
        }
        
        // 최적화 시작 전에 모든 파일의 상태를 '변환 중'으로 표시
        setFiles(prev => prev.map(f => ({ 
            ...f, 
            isProcessing: true,
            error: '', 
            optimizedUrl: f.optimizedUrl ? (URL.revokeObjectURL(f.optimizedUrl), '') : '',
            optimizedSize: 0 
        })));

        setIsOptimizing(true); // 전체 로딩 시작
        setGlobalError('');

        const formData = new FormData();
        // ⭐ 핵심: 모든 파일을 'file'이라는 같은 키로 FormData에 추가
        files.forEach(fileState => {
            formData.append('file', fileState.file);
        });

        formData.append('lossy', settings.lossy.toString());
        formData.append('colors', settings.colors.toString());

        try {
            // ⭐ 하나의 fetch 요청으로 모든 파일을 전송
            const response = await fetch('http://127.0.0.1:5000/api/optimize-gif', {
                method: 'POST',
                body: formData,
            });
            
            let responseData: ServerResponse | { error: string };
            
            if (!response.ok) {
                const errorText = await response.text();
                try {
                    responseData = JSON.parse(errorText);
                    setGlobalError(`🚨 서버 오류: ${('error' in responseData) ? responseData.error : `상태 코드 ${response.status} 및 알 수 없는 오류`}`);
                } catch {
                     setGlobalError(`🚨 서버 오류: 상태 코드 ${response.status}. 자세한 정보 없음.`);
                }
                
                throw new Error("Optimization failed on server."); // 아래 로직 실행 방지
            }

            // ⭐ 응답 데이터를 JSON으로 파싱
            responseData = await response.json() as ServerResponse; 
            
            // 기존 상태를 기반으로 새로운 상태를 계산
            setFiles(prevFiles => {
                const newFiles = prevFiles.map(f => {
                    // 원본 파일 이름(또는 ID)을 기준으로 결과를 찾습니다.
                    const result = responseData.results.find(r => r.filename === f.file.name);
                    
                    if (!result) {
                        return { ...f, isProcessing: false, error: '서버에서 이 파일의 결과를 찾을 수 없습니다.' };
                    }

                    if (result.error) {
                        return { ...f, isProcessing: false, error: `개별 오류: ${result.error}` };
                    }
                    
                    if (result.optimized_data && result.optimized_size !== null) {
                        try {
                            // Base64 문자열을 Blob으로 디코딩
                            const optimizedBlob = b64toBlob(result.optimized_data);
                            const optimizedUrl = URL.createObjectURL(optimizedBlob);
                            const reductionRate = ((f.originalSize - optimizedBlob.size) / f.originalSize) * 100;
                            
                            // 이전 최적화 URL 해제
                            if (f.optimizedUrl) URL.revokeObjectURL(f.optimizedUrl);
                            
                            return {
                                ...f,
                                isProcessing: false,
                                optimizedUrl,
                                optimizedSize: optimizedBlob.size,
                                reductionRate,
                                error: '',
                            };
                        } catch (e) {
                            return { ...f, isProcessing: false, error: '결과 디코딩 오류', optimizedUrl: '', optimizedSize: 0 };
                        }
                    }
                    
                    return { ...f, isProcessing: false, error: '최적화 실패 (데이터 누락)', optimizedUrl: '', optimizedSize: 0 };
                });
                return newFiles;
            });
            
        } catch (err: any) {
             // fetch 자체의 오류나 위의 throw new Error에 대한 처리
             if (err.message !== "Optimization failed on server.") {
                setGlobalError(`🚨 최적화 오류: 서버와의 통신에 실패했습니다. (${err.message})`);
             }
            
             // 실패한 파일들의 isProcessing 상태를 false로 업데이트
             setFiles(prev => prev.map(f => ({ ...f, isProcessing: false })));

        } finally {
            setIsOptimizing(false); // 전체 로딩 종료
        }
    }, [files, settings]);
    
    // ⭐ 4. 개별 다운로드 핸들러
    const handleDownload = useCallback((url: string, fileName: string) => (event: MouseEvent<HTMLButtonElement>) => {
        if (url && fileName) {
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `optimized_${fileName}`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, []);

    // ⭐ 5. 전체 다운로드 핸들러
    const handleDownloadAll = useCallback(() => {
        files.forEach((fileState, index) => {
            if (fileState.optimizedUrl) {
                const link = document.createElement('a');
                link.href = fileState.optimizedUrl;
                link.setAttribute('download', `optimized_${fileState.file.name}`);
                // 연속 다운로드를 위한 약간의 지연
                setTimeout(() => {
                    link.click();
                }, 100 * index); 
            }
        });
    }, [files]);

    // 전체 통계 계산
    const totalOriginalSize = useMemo(() => files.reduce((acc, f) => acc + f.originalSize, 0), [files]);
    const totalOptimizedSize = useMemo(() => files.reduce((acc, f) => acc + f.optimizedSize, 0), [files]);
    const totalReductionRate = useMemo(() => {
        if (totalOriginalSize > 0 && totalOptimizedSize > 0) {
            return ((totalOriginalSize - totalOptimizedSize) / totalOriginalSize) * 100;
        }
        return 0;
    }, [totalOriginalSize, totalOptimizedSize]);
    
    // === 렌더링 ===
    return (
        <div className="container">
            <button className="theme-toggle-button" onClick={handleThemeToggle}>
                {isDarkMode ? '☀️' : '🌙'}
            </button>
            
            <h1>GIF 익스트림 압축기 (멀티 파일 지원)</h1>

            {/* 1. 파일 업로드 */}
            <div className="section">
                <h2>1. GIF 파일 업로드</h2>
                <label htmlFor="hidden-file-input" className="custom-file-input-label">
                    <div className="upload-content">
                        <p>
                            <strong>
                                {files.length > 0 
                                    ? `${files.length}개의 파일 선택됨 (${formatBytes(totalOriginalSize)})` 
                                    : '여기에 파일을 끌어다 놓거나'}
                            </strong>
                        </p>
                    </div>
                </label>
                <input 
                    id="hidden-file-input"
                    type="file" 
                    accept=".gif" 
                    onChange={handleFileChange} 
                    className="hidden-input" 
                    multiple 
                />
            </div>

            {files.length > 0 && (
                <div className="section">
                    <h2>2. 최적화 설정 및 실행</h2>
                    <div className="controls-grid">
                        {/* Lossy 슬라이더 */}
                        <div className="control-group">
                            <label htmlFor="lossy">Lossy 값 (0-300): **{settings.lossy}**</label>
                            <input 
                                id="lossy"
                                type="range" 
                                min="0" 
                                max="300" 
                                step="10"
                                value={settings.lossy} 
                                onChange={handleSettingChange('lossy', 0, 300)}
                                className="range-input"
                            />
                            <input
                                type="number"
                                min="0"
                                max="300"
                                value={settings.lossy}
                                onChange={handleSettingChange('lossy', 0, 300)}
                                className="number-input"
                            />
                        </div>

                        {/* Colors 슬라이더 */}
                        <div className="control-group">
                            <label htmlFor="colors">Colors 수 (2-256): **{settings.colors}**</label>
                            <input 
                                id="colors"
                                type="range" 
                                min="2" 
                                max="256" 
                                step="2"
                                value={settings.colors} 
                                onChange={handleSettingChange('colors', 2, 256)} 
                                className="range-input"
                            />
                            <input
                                type="number"
                                min="2"
                                max="256"
                                value={settings.colors}
                                onChange={handleSettingChange('colors', 2, 256)}
                                className="number-input"
                            />
                        </div>
                    </div>

                    <button 
                        onClick={handleOptimizeAll} 
                        disabled={isOptimizing}
                        className="optimize-button"
                    >
                        {isOptimizing 
                            ? `변환 중... (총 ${files.length}개 파일)` 
                            : `🔥 ${files.length}개 파일 최적화 시작`}
                    </button>

                    <p className="guidance-text">
                        **중요:** `Lossy` 값과 `Colors` 값이 **클수록** GIF의 파일 용량은 크게 줄어들지만, **화질 저하**와 **색상 손실**이 발생할 수 있습니다. 최적의 결과를 얻으려면 여러 값을 시험해 보세요.
                    </p>

                    {globalError && <p className="error-text">🚨 {globalError}</p>}
                </div>
            )}
            
            {/* 3. 파일 목록 및 결과 */}
            {files.length > 0 && (
                <div className="section">
                    <h2>3. 파일별 결과 및 미리보기</h2>
                    
                    {/* 전체 통계 및 전체 다운로드 버튼 */}
                    <div className="total-stats-bar">
                        <p>
                            총 파일 수: <strong>{files.length}</strong> | 
                            총 절감률: 
                            <strong className="reduction-rate">
                                {totalReductionRate.toFixed(2)} %
                            </strong> 
                            ({formatBytes(totalOriginalSize)} → {formatBytes(totalOptimizedSize)})
                        </p>
                        <button 
                            onClick={handleDownloadAll} 
                            disabled={isOptimizing || files.every(f => !f.optimizedUrl)}
                            className="download-all-button"
                        >
                            ⬇️ 전체 다운로드 ({files.filter(f => f.optimizedUrl).length}개)
                        </button>
                    </div>
                    
                    {/* 파일 목록 반복 */}
                    <div className="file-list-grid">
                        {files.map(fileState => (
                            <div key={fileState.id} className={`file-card ${fileState.optimizedUrl ? 'optimized' : ''} ${fileState.error ? 'error' : ''}`}>
                                <h3>{fileState.file.name}</h3>
                                
                                <div className="preview-comparison">
                                    {/* 원본 GIF */}
                                    <div className="preview-box">
                                        <h4>원본 ({formatBytes(fileState.originalSize)})</h4>
                                        <img src={fileState.originalUrl} alt="Original GIF" className="gif-image" />
                                    </div>

                                    {/* 최적화 GIF */}
                                    <div className="preview-box">
                                        <h4>최적화 결과</h4>
                                        {isOptimizing && fileState.isProcessing ? (
                                            <div className="loading-overlay active">
                                                <div className="spinner"></div>
                                                <p>변환 중...</p>
                                            </div>
                                        ) : fileState.optimizedUrl ? (
                                            <>
                                                <img src={fileState.optimizedUrl} alt="Optimized GIF" className="gif-image" />
                                                <p className="result-stats">
                                                    <strong>{formatBytes(fileState.optimizedSize)}</strong> 
                                                    (<span className="reduction-rate">{fileState.reductionRate.toFixed(2)} % 절감</span>)
                                                </p>
                                                <button 
                                                    onClick={handleDownload(fileState.optimizedUrl, fileState.file.name)} 
                                                    className="download-single-button"
                                                >
                                                    ⬇️ 다운로드
                                                </button>
                                            </>
                                        ) : fileState.error ? (
                                            <p className="error-text small-error">⚠️ {fileState.error}</p>
                                        ) : (
                                            <p className="placeholder-text">최적화 대기 중</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GifOptimizer;