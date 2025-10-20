import React, { 
    useState, 
    useCallback, 
    useMemo,
    useEffect
} from 'react';
import type { 
    ChangeEvent, 
    MouseEvent,
    DragEvent,
} from 'react';
import './GifOptimizer.css';

// ------------------- 타입 정의 -------------------
interface OptimizationSettings {
    lossy: number;
    colors: number;
}

interface GifFileState {
    id: number;
    file: File;
    originalUrl: string;
    originalSize: number;

    optimizedUrl: string;
    optimizedSize: number;
    reductionRate: number;

    isProcessing: boolean;
    error: string;
}

interface OptimizationResult {
    filename: string;
    original_size: number;
    optimized_data: string | null;
    optimized_size: number | null;
    error: string | null;
}

interface ServerResponse {
    results: OptimizationResult[];
}

// ------------------- 유틸 함수 -------------------
const formatBytes = (bytes: number, decimals: number = 2): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const b64toBlob = (b64Data: string, contentType: string = 'image/gif'): Blob => {
    const byteCharacters = atob(b64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
};

// 환경변수로 백엔드 URL 관리 (Vite: VITE_API_URL)
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:5000';

// ------------------- 메인 컴포넌트 -------------------
const GifOptimizer: React.FC = () => {
    const [files, setFiles] = useState<GifFileState[]>([]);
    const [settings, setSettings] = useState<OptimizationSettings>({
        lossy: 200,
        colors: 64,
    });
    const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
    const [globalError, setGlobalError] = useState<string>('');
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
    const [isDragActive, setIsDragActive] = useState<boolean>(false);
    const [toastMessage, setToastMessage] = useState<string>('');

    // 테마 및 클린업
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

    const processFiles = useCallback((fileList: FileList | File[]) => {
        const selectedFiles = Array.from(fileList || []);

        setFiles(prev => {
            const existingKeys = new Set(prev.map(p => `${p.file.name}_${p.file.size}`));
            const batchKeys = new Set<string>();
            const newFileStates: GifFileState[] = [];
            let errorCount = 0;

            const duplicateNames: string[] = [];
            selectedFiles.forEach((file, index) => {
                const key = `${file.name}_${file.size}`;
                if (file.type === 'image/gif' && !existingKeys.has(key) && !batchKeys.has(key)) {
                    batchKeys.add(key);
                    const url = URL.createObjectURL(file);
                    newFileStates.push({
                        id: Date.now() + Math.floor(Math.random() * 100000) + index,
                        file,
                        originalUrl: url,
                        originalSize: file.size,
                        optimizedUrl: '',
                        optimizedSize: 0,
                        reductionRate: 0,
                        isProcessing: false,
                        error: '',
                    });
                } else {
                    // either not a GIF or duplicate
                    if (file.type === 'image/gif') duplicateNames.push(file.name);
                    errorCount++;
                }
            });

            if (errorCount > 0) {
                setGlobalError(`🚨 ${errorCount}개의 파일이 제외되었습니다. (GIF 형식이 아니거나 중복 파일)`);
                if (duplicateNames.length > 0) {
                    setToastMessage(`이미 등록된 파일: ${duplicateNames.slice(0,3).join(', ')}${duplicateNames.length>3?` 외 ${duplicateNames.length-3}개` : ''}`);
                    setTimeout(() => setToastMessage(''), 3500);
                }
            } else {
                setGlobalError('');
            }

            return [...prev, ...newFileStates];
        });
    }, []);

    const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        processFiles(event.target.files || []);
        event.target.value = '';
    }, [processFiles]);

    const handleDragEnter = useCallback((e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    }, []);

    const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        // 필요 시 drop을 허용
        e.dataTransfer.dropEffect = 'copy';
        setIsDragActive(true);
    }, []);

    const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
    }, []);

    const handleDrop = useCallback((e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    }, [processFiles]);

    const handleSettingChange = useCallback((name: keyof OptimizationSettings, min: number, max: number) => (
        (event: ChangeEvent<HTMLInputElement>) => {
            let value = parseInt(event.target.value) || min;
            value = Math.max(min, Math.min(max, value));
            setSettings(prev => ({ ...prev, [name]: value }));
        }
    ), []);

    const handleOptimizeAll = useCallback(async () => {
        if (files.length === 0) {
            setGlobalError('먼저 GIF 파일을 업로드해주세요.');
            return;
        }

        // 최적화 시작 전 상태 초기화
        setFiles(prev => prev.map(f => ({
            ...f,
            isProcessing: true,
            error: '',
            optimizedUrl: f.optimizedUrl ? (URL.revokeObjectURL(f.optimizedUrl), '') : '',
            optimizedSize: 0,
        })));
        setIsOptimizing(true);
        setGlobalError('');

        const formData = new FormData();
        files.forEach(fileState => {
            const uniqueFilename = `${fileState.id}_${fileState.file.name}`;  // ✅ 고유 이름 생성
            formData.append('file', fileState.file, uniqueFilename);
        });
        formData.append('lossy', settings.lossy.toString());
        formData.append('colors', settings.colors.toString());

        try {
            const response = await fetch(`${API_BASE}/api/optimize-gif`, {
                method: 'POST',
                body: formData,
            });

            let responseData: ServerResponse | { error: string };

            if (!response.ok) {
                const errorText = await response.text();
                try {
                    responseData = JSON.parse(errorText);
                    setGlobalError(`🚨 서버 오류: ${('error' in responseData) ? responseData.error : `상태 코드 ${response.status}`}`);
                } catch {
                    setGlobalError(`🚨 서버 오류: 상태 코드 ${response.status}.`);
                }
                throw new Error("Optimization failed on server.");
            }

            responseData = await response.json() as ServerResponse;

            setFiles(prevFiles => {
                const newFiles = prevFiles.map(f => {
                    const matchName = `${f.id}_${f.file.name}`;
                    const result = responseData.results.find(r => r.filename === matchName);

                    if (!result) {
                        return {
                            ...f,
                            isProcessing: false,
                            error: '서버 응답에서 결과를 찾을 수 없습니다.',
                        };
                    }
                    if (result.error) {
                        return {
                            ...f,
                            isProcessing: false,
                            error: result.error,
                        };
                    }
                    if (result.optimized_data && result.optimized_size !== null) {
                        try {
                            const optimizedBlob = b64toBlob(result.optimized_data);
                            const optimizedUrl = URL.createObjectURL(optimizedBlob);
                            const reductionRate = ((f.originalSize - optimizedBlob.size) / f.originalSize) * 100;
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
                            return {
                                ...f,
                                isProcessing: false,
                                error: '디코딩 오류',
                                optimizedUrl: '',
                                optimizedSize: 0,
                            };
                        }
                    }
                    return {
                        ...f,
                        isProcessing: false,
                        error: '최적화 실패',
                        optimizedUrl: '',
                        optimizedSize: 0,
                    };
                });
                return newFiles;
            });

        } catch (err: any) {
            if (err.message !== "Optimization failed on server.") {
                setGlobalError(`🚨 통신 실패: ${err.message}`);
            }
            setFiles(prev => prev.map(f => ({ ...f, isProcessing: false })));
        } finally {
            setIsOptimizing(false);
        }
    }, [files, settings]);

    const handleDownload = useCallback((url: string, fileName: string) => (_event: MouseEvent<HTMLButtonElement>) => {
        if (url && fileName) {
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `optimized_${fileName}`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, []);

    const handleDownloadAll = useCallback(() => {
        files.forEach((fileState, index) => {
            if (fileState.optimizedUrl) {
                const link = document.createElement('a');
                link.href = fileState.optimizedUrl;
                link.setAttribute('download', `optimized_${fileState.file.name}`);
                setTimeout(() => {
                    link.click();
                }, 100 * index);
            }
        });
    }, [files]);

    const handleRemoveFile = useCallback((id: number) => {
        setFiles(prev => {
            const toRemove = prev.find(p => p.id === id);
            if (toRemove) {
                URL.revokeObjectURL(toRemove.originalUrl);
                if (toRemove.optimizedUrl) URL.revokeObjectURL(toRemove.optimizedUrl);
            }
            return prev.filter(p => p.id !== id);
        });
    }, []);

    const handleClearAll = useCallback(() => {
        setFiles(prev => {
            prev.forEach(p => {
                URL.revokeObjectURL(p.originalUrl);
                if (p.optimizedUrl) URL.revokeObjectURL(p.optimizedUrl);
            });
            return [];
        });
    }, []);

    const totalOriginalSize = useMemo(() => files.reduce((acc, f) => acc + f.originalSize, 0), [files]);
    const totalOptimizedSize = useMemo(() => files.reduce((acc, f) => acc + f.optimizedSize, 0), [files]);
    const totalReductionRate = useMemo(() => {
        if (totalOriginalSize > 0 && totalOptimizedSize > 0) {
            return ((totalOriginalSize - totalOptimizedSize) / totalOriginalSize) * 100;
        }
        return 0;
    }, [totalOriginalSize, totalOptimizedSize]);

    return (
        <div className="container">
            {toastMessage && (
                <div className="toast" role="status">
                    {toastMessage}
                </div>
            )}
            <button className="theme-toggle-button" onClick={handleThemeToggle}>
                {isDarkMode ? '☀️' : '🌙'}
            </button>

            <h1>GIF 익스트림 압축기 (멀티 파일 지원)</h1>

            <div className="section">
                <h2>1. GIF 파일 업로드</h2>
                <label
                    htmlFor="hidden-file-input"
                    className={`custom-file-input-label ${isDragActive ? 'drag-active' : ''}`}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
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
                        <div className="control-group">
                            <label htmlFor="lossy">손실압축 값 (0-300): **{settings.lossy}**</label>
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

                        <div className="control-group">
                            <label htmlFor="colors">색상수 (2-256): **{settings.colors}**</label>
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

                    <div className="guidance-text">
                        <div className="guidance-title">★ 중요 ★</div>
                        <div className="guidance-body">
                            <p><code>손실압축 값</code>이 클수록 압축이 강해져 파일 크기는 더 작아지지만 화질 저하가 발생합니다.</p>
                            <p><code>색상수</code>가 줄어들수록 파일 크기가 작아지지만 색상 계조나 표현이 손실될 수 있습니다.</p>
                            <p>최적의 결과를 얻으려면 다양한 <code>손실압축 값</code>과 <code>색상수</code> 조합을 시험해 보세요.</p>
                        </div>
                    </div>

                    {/* {globalError && <p className="error-text">🚨 {globalError}</p>} */}
                </div>
            )}

            {files.length > 0 && (
                <div className="section">
                    <h2>3. 파일별 결과 및 미리보기</h2>

                    <div className="total-stats-bar">
                        <p>
                            총 파일 수: <strong>{files.length}</strong> | 총 절감률:{' '}
                            <strong className="reduction-rate">
                                {totalReductionRate.toFixed(2)} %
                            </strong>{' '}
                            ({formatBytes(totalOriginalSize)} → {formatBytes(totalOptimizedSize)})
                        </p>
                        <div className="total-actions">
                            <button
                                onClick={handleDownloadAll}
                                disabled={isOptimizing || files.every(f => !f.optimizedUrl)}
                                className="download-all-button"
                            >
                                ⬇️ 전체 다운로드 ({files.filter(f => f.optimizedUrl).length}개)
                            </button>
                            <button
                                onClick={handleClearAll}
                                disabled={files.length === 0}
                                className="clear-all-button"
                            >
                                🗑️ 모두 삭제
                            </button>
                        </div>
                    </div>

                    <div className="file-list-grid">
                        {files.map(fileState => (
                            <div
                                key={fileState.id}
                                className={`file-card ${fileState.optimizedUrl ? 'optimized' : ''} ${fileState.error ? 'error' : ''}`}
                            >
                                <h3>{fileState.file.name}</h3>

                                <div className="preview-comparison">
                                    <div className="preview-box">
                                        <h4>원본 ({formatBytes(fileState.originalSize)})</h4>
                                        <img src={fileState.originalUrl} alt="Original GIF" className="gif-image" />
                                    </div>

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
                                                    <strong>{formatBytes(fileState.optimizedSize)}</strong>{' '}
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
                                <div className="file-actions">
                                    <button
                                        onClick={() => handleRemoveFile(fileState.id)}
                                        className="remove-file-button"
                                    >
                                        🗑️ 삭제
                                    </button>
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