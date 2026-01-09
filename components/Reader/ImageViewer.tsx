

import React, { useRef, useEffect, useState, memo, useCallback } from 'react';
import { MokuroBlock, MokuroPage, ReaderSettings, MokuroData } from '../../types';
import JSZip from 'jszip';
import { loadImage } from '../../services/parser';
import { RefreshCw } from 'lucide-react';

export interface PageContent {
    url: string;
    ocr: MokuroPage | null;
    isTranslated?: boolean;
}

interface ImageViewerProps {
  showOcr: boolean;
  highlightOcr: boolean; // Deprecated
  onOcrClick: (text: string, box: MokuroBlock) => void;
  scale: number;
  setScale: (s: number) => void;
  readingDirection: 'ltr' | 'rtl';
  settings: ReaderSettings;
  pages: PageContent[]; 
  zip?: JSZip | null;
  imageFiles?: string[];
  translatedZip?: JSZip | null;
  translatedImageFiles?: string[];
  pageOffset?: number;
  mokuroData?: MokuroData | null;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  
  isSelecting?: boolean;
  onCrop?: (dataUrl: string) => void;
  isMagnifying?: boolean;
  magnifierLevel?: number;
}

const getLineSeparator = (lang: string | undefined) => {
    // CJK languages usually don't use spaces between lines/words in this context
    const cjk = ['zh', 'zh-Hant', 'ja', 'ko'];
    if (lang && cjk.includes(lang)) {
        return '';
    }
    // For English and others, add a space to prevent "word\nword" becoming "wordword" or relying on newline rendering
    return ' ';
};

const ImageViewer: React.FC<ImageViewerProps> = memo((props) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const Viewer = props.settings.pageViewMode === 'webtoon' ? WebtoonViewer : PaginationViewer;
    
    return (
        <div className="relative w-full h-full overflow-hidden" ref={containerRef} style={{ touchAction: 'none' }}>
            <Viewer {...props} containerRef={containerRef} />
            {props.isSelecting && props.onCrop && (
                <CropOverlay containerRef={containerRef} onCrop={props.onCrop} />
            )}
            {props.isMagnifying && (
                <MagnifierOverlay containerRef={containerRef} zoomLevel={props.magnifierLevel || 2.5} />
            )}
        </div>
    );
});

// --- Magnifier Overlay Component ---
const MagnifierOverlay: React.FC<{ containerRef: React.RefObject<HTMLDivElement | null>, zoomLevel: number }> = ({ containerRef, zoomLevel }) => {
    const [pos, setPos] = useState<{ x: number, y: number } | null>(null);
    const [lensData, setLensData] = useState<{ src: string, imgRect: DOMRect } | null>(null);
    const isDragging = useRef(false);

    // Initialize position at center
    useEffect(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPos({ x: rect.width / 2, y: rect.height / 2 });
        }
    }, []);

    const updateLensData = (x: number, y: number) => {
        if (!containerRef.current) return;
        const images = containerRef.current.querySelectorAll('img');
        let found = false;
        
        for (let i = images.length - 1; i >= 0; i--) {
            const img = images[i];
            const rect = img.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                setLensData({ src: img.src, imgRect: rect });
                found = true;
                break;
            }
        }
        if (!found) setLensData(null);
    };

    useEffect(() => {
        if (pos) updateLensData(pos.x, pos.y);
    }, [pos]);

    // Only allow drag if starting on the lens itself
    const handlePointerDown = (e: React.PointerEvent) => {
        // We only care if the user clicked ON the lens, which is handled by the lens component
        // But since lens is child, we can handle global move here if drag started
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDragging.current) {
            e.preventDefault();
            setPos({ x: e.clientX, y: e.clientY });
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isDragging.current) {
            isDragging.current = false;
            // (e.target as HTMLElement).releasePointerCapture(e.pointerId); // Managed by lens
        }
    };

    return (
        <div 
            className="absolute inset-0 z-[60] touch-none pointer-events-none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {pos && lensData && (
                <MagnifierLens 
                    x={pos.x} y={pos.y} 
                    src={lensData.src} 
                    imgRect={lensData.imgRect} 
                    zoomLevel={zoomLevel}
                    onDragStart={(e) => {
                        isDragging.current = true;
                        (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                />
            )}
        </div>
    );
};

const MagnifierLens: React.FC<{ 
    x: number, y: number, src: string, imgRect: DOMRect, zoomLevel: number,
    onDragStart: (e: React.PointerEvent) => void 
}> = ({ x, y, src, imgRect, zoomLevel, onDragStart }) => {
    const SIZE = 240;
    const relX = (x - imgRect.left) / imgRect.width;
    const relY = (y - imgRect.top) / imgRect.height;
    const bgX = relX * imgRect.width * zoomLevel - SIZE / 2;
    const bgY = relY * imgRect.height * zoomLevel - SIZE / 2;

    return (
        <div 
            className="pointer-events-auto z-[70] fixed border-4 border-white shadow-2xl rounded-full bg-black cursor-move"
            onPointerDown={onDragStart}
            onPointerUp={(e) => (e.target as HTMLElement).releasePointerCapture(e.pointerId)}
            style={{
                left: x - SIZE / 2,
                top: y - SIZE / 2,
                width: SIZE,
                height: SIZE,
                backgroundImage: `url(${src})`,
                backgroundSize: `${imgRect.width * zoomLevel}px ${imgRect.height * zoomLevel}px`,
                backgroundPosition: `-${bgX}px -${bgY}px`,
            }} 
        >
            <div className="absolute inset-0 border border-black/10 rounded-full" />
        </div>
    );
};

// --- Crop Overlay Component ---
const CropOverlay: React.FC<{ containerRef: React.RefObject<HTMLDivElement | null>, onCrop: (data: string) => void }> = ({ containerRef, onCrop }) => {
    const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
    const [currPos, setCurrPos] = useState<{x: number, y: number} | null>(null);

    const handleDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setStartPos({ x: e.clientX, y: e.clientY });
        setCurrPos({ x: e.clientX, y: e.clientY });
    };

    const handleMove = (e: React.PointerEvent) => {
        if (!startPos) return;
        e.preventDefault();
        e.stopPropagation();
        setCurrPos({ x: e.clientX, y: e.clientY });
    };

    const handleUp = (e: React.PointerEvent) => {
        if (!startPos || !currPos || !containerRef.current) {
            setStartPos(null);
            return;
        }
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        const x = Math.min(startPos.x, currPos.x);
        const y = Math.min(startPos.y, currPos.y);
        const w = Math.abs(currPos.x - startPos.x);
        const h = Math.abs(currPos.y - startPos.y);

        if (w > 10 && h > 10) {
            const imgs = containerRef.current.querySelectorAll('img');
            let bestCrop: string | null = null;
            let maxArea = 0;

            imgs.forEach((img) => {
                const rect = img.getBoundingClientRect();
                const interX = Math.max(rect.left, x);
                const interY = Math.max(rect.top, y);
                const interW = Math.min(rect.right, x + w) - interX;
                const interH = Math.min(rect.bottom, y + h) - interY;

                if (interW > 0 && interH > 0) {
                    const area = interW * interH;
                    if (area > maxArea) {
                        maxArea = area;
                        const scaleX = img.naturalWidth / rect.width;
                        const scaleY = img.naturalHeight / rect.height;
                        const sx = (interX - rect.left) * scaleX;
                        const sy = (interY - rect.top) * scaleY;
                        const sw = interW * scaleX;
                        const sh = interH * scaleY;

                        const canvas = document.createElement('canvas');
                        canvas.width = sw;
                        canvas.height = sh;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
                            bestCrop = canvas.toDataURL('image/png');
                        }
                    }
                }
            });

            if (bestCrop) {
                onCrop(bestCrop);
            }
        }
        setStartPos(null);
        setCurrPos(null);
    };

    return (
        <div 
            className="absolute inset-0 z-50 cursor-crosshair touch-none"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
        >
            {startPos && currPos && (
                <div 
                    className="absolute border-2 border-primary bg-primary/20 pointer-events-none"
                    style={{
                        left: Math.min(startPos.x, currPos.x),
                        top: Math.min(startPos.y, currPos.y),
                        width: Math.abs(currPos.x - startPos.x),
                        height: Math.abs(currPos.y - startPos.y)
                    }}
                />
            )}
        </div>
    );
};

// --- Webtoon Mode Viewer ---
const WebtoonViewer: React.FC<ImageViewerProps & { containerRef: React.RefObject<HTMLDivElement | null> }> = ({ 
    zip, imageFiles, onOcrClick, settings, mokuroData, showOcr, currentPage, onPageChange, containerRef
}) => {
    const scrollRafId = useRef<number | null>(null);
    const lastScrollTime = useRef(0);
    const isScrollingProgrammatically = useRef(false);

    useEffect(() => {
        if (typeof currentPage === 'number' && containerRef.current && !isScrollingProgrammatically.current) {
            const el = document.getElementById(`webtoon-page-${currentPage}`);
            if (el) {
                isScrollingProgrammatically.current = true;
                el.scrollIntoView({ behavior: 'auto', block: 'start' });
                setTimeout(() => { isScrollingProgrammatically.current = false; }, 500);
            }
        }
    }, [currentPage]);

    useEffect(() => {
        const handleScroll = () => {
            if (isScrollingProgrammatically.current) return;
            if (Date.now() - lastScrollTime.current < 100) return;
            lastScrollTime.current = Date.now();

            if (scrollRafId.current) cancelAnimationFrame(scrollRafId.current);
            scrollRafId.current = requestAnimationFrame(() => {
                if (!onPageChange || !imageFiles || !containerRef.current) return;
                
                const containerRect = containerRef.current.getBoundingClientRect();
                const centerY = containerRect.top + containerRect.height / 2;
                
                const pages = containerRef.current.querySelectorAll('[id^="webtoon-page-"]');
                let bestIdx = -1;
                let minDist = Infinity;

                for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    const rect = page.getBoundingClientRect();
                    if (rect.bottom < containerRect.top - 500) continue; 
                    if (rect.top > containerRect.bottom + 500) break; 

                    const pageCenterY = rect.top + rect.height / 2;
                    const dist = Math.abs(pageCenterY - centerY);
                    if (dist < minDist) {
                        minDist = dist;
                        bestIdx = parseInt(page.id.replace('webtoon-page-', ''));
                    }
                }
                if (bestIdx !== -1) {
                    onPageChange(bestIdx);
                }
            });
        };
        const container = containerRef.current;
        container?.addEventListener('scroll', handleScroll);
        return () => {
            container?.removeEventListener('scroll', handleScroll);
            if(scrollRafId.current) cancelAnimationFrame(scrollRafId.current);
        };
    }, [onPageChange, imageFiles]);

    return (
        <div className="w-full h-full overflow-y-auto scroll-smooth overscroll-none">
            <div className={`max-w-3xl mx-auto flex flex-col items-center min-h-full pb-32 ${settings.theme === 'light' ? 'bg-zinc-200' : 'bg-black'}`}>
                {imageFiles?.map((filename, index) => {
                     const pageOcr = mokuroData?.pages.find(p => p.img_path.includes(filename)) || mokuroData?.pages[index];
                    return (
                        <LazyWebtoonImage 
                            key={`${filename}-${index}`}
                            id={`webtoon-page-${index}`} 
                            index={index}
                            zip={zip}
                            filename={filename}
                            ocr={pageOcr || null}
                            showOcr={showOcr}
                            onOcrClick={onOcrClick}
                            dictionaryMode={settings.dictionaryMode}
                            overlayStyle={settings.overlayStyle}
                            theme={settings.theme}
                            learningLanguage={settings.learningLanguage}
                        />
                    )
                })}
            </div>
        </div>
    );
};

const LazyWebtoonImage: React.FC<{ 
    id: string,
    index: number, 
    zip?: JSZip | null, 
    filename: string,
    ocr: MokuroPage | null,
    showOcr: boolean,
    onOcrClick: (text: string, box: MokuroBlock) => void,
    dictionaryMode: 'panel' | 'popup',
    overlayStyle: 'hidden' | 'outline' | 'fill',
    theme: 'light' | 'dark',
    learningLanguage: string | undefined
}> = ({ id, index, zip, filename, ocr, showOcr, onOcrClick, dictionaryMode, overlayStyle, theme, learningLanguage }) => {
    const [url, setUrl] = useState<string>('');
    const imgRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); }
        }, { rootMargin: '1000px' }); 
        if (imgRef.current) observer.observe(imgRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (isVisible && !url && zip) {
            loadImage(zip, filename).then(setUrl);
        }
    }, [isVisible, zip, filename, url]);

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!showOcr) return; // Prevent OCR if disabled
        if (!ocr || !imgRef.current) return;
        const img = imgRef.current.querySelector('img');
        if (!img) return;
        const rect = img.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const scaleX = img.naturalWidth / rect.width;
        const scaleY = img.naturalHeight / rect.height;
        const svgX = x * scaleX;
        const svgY = y * scaleY;

        const sep = getLineSeparator(learningLanguage);

        for (const block of ocr.blocks) {
            const [bx1, by1, bx2, by2] = block.box;
            if (svgX >= bx1 && svgX <= bx2 && svgY >= by1 && svgY <= by2) {
                e.stopPropagation();
                onOcrClick(block.lines.join(sep), block);
                return;
            }
        }
    };

    return (
        <div 
            id={id} ref={imgRef} 
            className={`w-full relative min-h-[100px] flex items-center justify-center border-b ${theme === 'light' ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-950 border-zinc-900'}`}
            onPointerUp={handlePointerUp}
        >
            {url ? (
                <div className="relative w-full">
                    <img src={url} alt={`Page ${index}`} className="w-full h-auto block select-none pointer-events-none" />
                    {ocr && showOcr && (
                        <div className="absolute inset-0 pointer-events-none">
                            <svg className="w-full h-full" preserveAspectRatio="none">
                                <ImageOverlay 
                                    ocrData={ocr} 
                                    overlayStyle={overlayStyle}
                                    onOcrClick={() => {}} 
                                    dictionaryMode={dictionaryMode}
                                    pageIndex={index}
                                    allowInteraction={false}
                                />
                            </svg>
                        </div>
                    )}
                </div>
            ) : <div className={`w-full h-[500px] animate-pulse ${theme === 'light' ? 'bg-zinc-200' : 'bg-zinc-800'}`} />}
        </div>
    );
};

// --- Pagination Mode Viewer with Drag/Zoom ---
const PaginationViewer: React.FC<ImageViewerProps & { containerRef: React.RefObject<HTMLDivElement | null> }> = ({ 
  pages, showOcr, onOcrClick, scale, setScale, readingDirection, settings, containerRef
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Use a mutable ref for transform state to avoid react render loop on high frequency events
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  
  // Interaction state
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 }); // for drag delta
  const lastPos = useRef({ x: 0, y: 0 }); 
  const initialDist = useRef<number | null>(null); // for pinch zoom
  const initialScale = useRef(1);

  // Sync prop scale change (e.g. from reset)
  useEffect(() => {
      // If props scale implies reset, update ref
      if (Math.abs(scale - transform.current.scale) > 0.01 && scale === 1) {
          transform.current.scale = 1;
          transform.current.x = 0;
          transform.current.y = 0;
          updateDOM();
      }
  }, [scale]);

  // Reset on page change
  useEffect(() => {
      transform.current = { x: 0, y: 0, scale: 1 };
      updateDOM();
      if (scale !== 1) setScale(1);
  }, [pages]);

  const updateDOM = () => {
      if (contentRef.current) {
          contentRef.current.style.transform = `translate3d(${transform.current.x}px, ${transform.current.y}px, 0) scale(${transform.current.scale})`;
      }
  };

  const getDistance = (p1: React.PointerEvent, p2: React.PointerEvent) => {
      return Math.sqrt(Math.pow(p2.clientX - p1.clientX, 2) + Math.pow(p2.clientY - p1.clientY, 2));
  }

  const pointers = useRef<Map<number, React.PointerEvent>>(new Map());

  const onPointerDown = (e: React.PointerEvent) => {
      // Allow button clicks to pass through, but capture everything else on the layer
      if ((e.target as HTMLElement).closest('button')) return;
      
      e.preventDefault(); // Important: Prevent default browser behavior (scrolling/selection)
      
      containerRef.current?.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, e);

      if (pointers.current.size === 1) {
          isDragging.current = true;
          startPos.current = { x: e.clientX, y: e.clientY }; 
          lastPos.current = { x: e.clientX, y: e.clientY };
      } else if (pointers.current.size === 2) {
          isDragging.current = false; // Pinch overrides drag
          const p = Array.from(pointers.current.values());
          initialDist.current = getDistance(p[0], p[1]);
          initialScale.current = transform.current.scale;
      }
  };

  const onPointerMove = (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, e); 
      e.preventDefault(); // Stop native scrolling on non-iOS

      if (pointers.current.size === 2 && initialDist.current) {
          // Pinch Zoom
          const p = Array.from(pointers.current.values());
          const dist = getDistance(p[0], p[1]);
          const newScale = Math.min(Math.max(1, initialScale.current * (dist / initialDist.current)), 5);
          
          transform.current.scale = newScale;
          // If zooming out to 1, reset center
          if (newScale <= 1.05) {
              transform.current.x = 0;
              transform.current.y = 0;
          }
          updateDOM();
      } else if (isDragging.current && pointers.current.size === 1) {
          // Pan (only if scaled > 1)
          if (transform.current.scale > 1.01) {
              const dx = e.clientX - lastPos.current.x;
              const dy = e.clientY - lastPos.current.y;
              transform.current.x += dx; 
              transform.current.y += dy;
              lastPos.current = { x: e.clientX, y: e.clientY };
              requestAnimationFrame(updateDOM);
          } else {
              // Just track position for click detection if not scaled
              lastPos.current = { x: e.clientX, y: e.clientY };
          }
      }
  };

  const onPointerUp = (e: React.PointerEvent) => {
      pointers.current.delete(e.pointerId);
      containerRef.current?.releasePointerCapture(e.pointerId);
      
      if (pointers.current.size < 2) initialDist.current = null;
      
      if (pointers.current.size === 0) {
          if (isDragging.current) {
              isDragging.current = false;
              // Click check
              const dist = Math.sqrt(Math.pow(e.clientX - startPos.current.x, 2) + Math.pow(e.clientY - startPos.current.y, 2));
              if (dist < 10) { 
                   handleOCRClickLogic(e);
              } else {
                  // Snap back if scaled to 1
                   if (transform.current.scale <= 1.05) {
                       transform.current.x = 0;
                       transform.current.y = 0;
                       transform.current.scale = 1;
                       updateDOM();
                       setScale(1);
                   }
              }
          }
      } else if (pointers.current.size === 1) {
          // If one finger remains, resume dragging from current position
          const p = pointers.current.values().next().value;
          lastPos.current = { x: p.clientX, y: p.clientY };
          isDragging.current = true;
      }
  };

  const handleOCRClickLogic = (e: React.PointerEvent) => {
       if (!showOcr) return; // Fix: Prevent click if OCR disabled
       if (!contentRef.current) return;
       // Find which page image was clicked
       const wrappers = Array.from(contentRef.current.children) as HTMLElement[];
       const clickedWrapperIndex = wrappers.findIndex(w => {
           const r = w.getBoundingClientRect();
           return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
       });

       if (clickedWrapperIndex !== -1) {
           const wrapper = wrappers[clickedWrapperIndex];
           const page = pages[clickedWrapperIndex]; 
           
           if (page && page.ocr) {
               const img = wrapper.querySelector('img');
               if (img && img.naturalWidth) {
                   const rect = img.getBoundingClientRect();
                   const x = e.clientX - rect.left;
                   const y = e.clientY - rect.top;
                   const scaleX = img.naturalWidth / rect.width;
                   const scaleY = img.naturalHeight / rect.height;
                   const svgX = x * scaleX;
                   const svgY = y * scaleY;

                   const sep = getLineSeparator(settings.learningLanguage);

                   for (const block of page.ocr.blocks) {
                       const [bx1, by1, bx2, by2] = block.box;
                       if (svgX >= bx1 && svgX <= bx2 && svgY >= by1 && svgY <= by2) {
                           onOcrClick(block.lines.join(sep), block);
                           return; 
                       }
                   }
               }
           }
       }
  };

  const [showTranslated, setShowTranslated] = useState(false);
  let displayPages = pages;
  if (settings.pageViewMode === 'single') {
      if (settings.compareMode && pages.length > 1) {
          displayPages = [showTranslated ? pages[1] : pages[0]];
      } else { displayPages = pages.length > 0 ? [pages[0]] : []; }
  } else if (settings.pageViewMode === 'double' && settings.compareMode && pages.length > 1) {
      const [orig, trans] = pages;
      if (settings.comparisonLayout === 'swapped') {
          displayPages = [trans, orig]; 
      } else {
          displayPages = [orig, trans]; 
      }
  }

  return (
    <div 
      className="w-full h-full overflow-hidden relative flex items-center justify-center cursor-grab touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={(e) => {
          if (e.ctrlKey) {
             e.preventDefault();
             const newScale = Math.min(Math.max(1, transform.current.scale - e.deltaY * 0.01), 5);
             transform.current.scale = newScale;
             updateDOM();
          }
      }}
    >
      <div 
        ref={contentRef}
        className={`relative flex items-center justify-center gap-2 ${readingDirection === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}
        style={{ transformOrigin: 'center', willChange: 'transform' }} 
      >
        {displayPages.map((page, index) => (
            <div key={index} className="relative group">
                <img 
                    src={page.url} 
                    alt={`Page`} 
                    className="max-h-screen object-contain pointer-events-none select-none block"
                    style={{ maxWidth: settings.pageViewMode === 'double' ? '50vw' : '100vw' }} 
                />
                {page.ocr && showOcr && !page.isTranslated && (
                <div className="absolute inset-0 pointer-events-none">
                    <svg className="w-full h-full" preserveAspectRatio="none">
                        <ImageOverlay 
                            ocrData={page.ocr} 
                            overlayStyle={settings.overlayStyle}
                            onOcrClick={() => {}} 
                            dictionaryMode={settings.dictionaryMode} 
                            pageIndex={index}
                            allowInteraction={false}
                        />
                    </svg>
                </div>
                )}
            </div>
        ))}
      </div>
    </div>
  );
};

const ImageOverlay: React.FC<{
    ocrData: MokuroPage, 
    overlayStyle: 'hidden' | 'outline' | 'fill',
    onOcrClick: (text: string, box: MokuroBlock) => void,
    dictionaryMode: 'panel' | 'popup',
    pageIndex?: number,
    allowInteraction?: boolean
}> = ({ ocrData, overlayStyle, onOcrClick, dictionaryMode, pageIndex = 0, allowInteraction }) => {
    const gRef = useRef<SVGGElement>(null);

    useEffect(() => {
        const svg = gRef.current?.ownerSVGElement;
        const div = svg?.parentElement?.parentElement;
        const img = div?.querySelector('img');
        if (img && img.naturalWidth) {
           svg?.setAttribute("viewBox", `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
        }
    }, [ocrData]);

    const getStyleClass = () => {
        switch (overlayStyle) {
            case 'fill': 
                return 'fill-yellow-400/20 stroke-yellow-400 pointer-events-auto cursor-pointer hover:fill-yellow-400/40 transition-colors duration-150';
            case 'outline': 
                return 'fill-transparent stroke-yellow-200/50 stroke-[2px] pointer-events-auto cursor-pointer hover:stroke-yellow-400 hover:fill-yellow-400/10 transition-all duration-150';
            default: 
                // Changed from pointer-events-none to auto+cursor-pointer so users can click hidden bubbles
                return 'fill-transparent stroke-transparent pointer-events-auto cursor-pointer';
        }
    };

    const styleClass = getStyleClass();

    return (
        <g ref={gRef}>
             {ocrData.blocks.map((block, idx) => {
                const [x1, y1, x2, y2] = block.box;
                return (
                    <React.Fragment key={idx}>
                        <rect
                            x={x1} y={y1} width={x2-x1} height={y2-y1}
                            className={styleClass}
                        />
                    </React.Fragment>
                );
            })}
        </g>
    );
};

export default ImageViewer;