
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
}

const ImageViewer: React.FC<ImageViewerProps> = memo((props) => {
    // Shared container ref to find images for cropping
    const containerRef = useRef<HTMLDivElement>(null);

    const Viewer = props.settings.pageViewMode === 'webtoon' ? WebtoonViewer : PaginationViewer;
    
    return (
        <div className="relative w-full h-full" ref={containerRef}>
            <Viewer {...props} containerRef={containerRef} />
            {props.isSelecting && props.onCrop && (
                <CropOverlay containerRef={containerRef} onCrop={props.onCrop} />
            )}
            {props.isMagnifying && (
                <MagnifierOverlay containerRef={containerRef} />
            )}
        </div>
    );
});

// --- Magnifier Overlay Component ---
const MagnifierOverlay: React.FC<{ containerRef: React.RefObject<HTMLDivElement | null> }> = ({ containerRef }) => {
    const [lens, setLens] = useState<{ x: number, y: number, src: string, imgRect: DOMRect } | null>(null);

    const handleMove = (e: React.PointerEvent) => {
        if (!containerRef.current) return;
        const images = containerRef.current.querySelectorAll('img');
        let found = false;
        
        // Reverse order to handle z-index stacking if any
        for (let i = images.length - 1; i >= 0; i--) {
            const img = images[i];
            const rect = img.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right && 
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                
                setLens({
                    x: e.clientX,
                    y: e.clientY,
                    src: img.src,
                    imgRect: rect
                });
                found = true;
                break;
            }
        }
        if (!found) setLens(null);
    };

    return (
        <div 
            className="absolute inset-0 z-[60] cursor-none touch-none bg-transparent"
            onPointerMove={handleMove}
            onPointerLeave={() => setLens(null)}
        >
            {lens && <MagnifierLens {...lens} />}
        </div>
    );
};

const MagnifierLens: React.FC<{ x: number, y: number, src: string, imgRect: DOMRect }> = ({ x, y, src, imgRect }) => {
    const ZOOM = 2;
    const SIZE = 200;
    
    // Calculate position relative to image top-left (0..1)
    const relX = (x - imgRect.left) / imgRect.width;
    const relY = (y - imgRect.top) / imgRect.height;
    
    // Calculate background position to center the lens content
    const bgX = relX * imgRect.width * ZOOM - SIZE / 2;
    const bgY = relY * imgRect.height * ZOOM - SIZE / 2;

    return (
        <div style={{
            position: 'fixed',
            left: x - SIZE / 2,
            top: y - SIZE / 2,
            width: SIZE,
            height: SIZE,
            borderRadius: '50%',
            border: '4px solid rgba(255, 255, 255, 0.9)',
            boxShadow: '0 4px 25px rgba(0,0,0,0.6)',
            backgroundColor: '#000',
            backgroundImage: `url(${src})`,
            // backgroundSize must scale based on the displayed size of the image (imgRect) not natural size
            backgroundSize: `${imgRect.width * ZOOM}px ${imgRect.height * ZOOM}px`,
            backgroundPosition: `-${bgX}px -${bgY}px`,
            pointerEvents: 'none',
            zIndex: 100,
        }} />
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
            // Perform crop
            const imgs = containerRef.current.querySelectorAll('img');
            let bestCrop: string | null = null;
            let maxArea = 0;

            imgs.forEach((img) => {
                const rect = img.getBoundingClientRect();
                // Check intersection
                const interX = Math.max(rect.left, x);
                const interY = Math.max(rect.top, y);
                const interW = Math.min(rect.right, x + w) - interX;
                const interH = Math.min(rect.bottom, y + h) - interY;

                if (interW > 0 && interH > 0) {
                    const area = interW * interH;
                    if (area > maxArea) {
                        maxArea = area;
                        
                        // Crop logic
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
    // ... existing Webtoon logic ...
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
        <div className="w-full h-full overflow-y-auto bg-zinc-900 scroll-smooth overscroll-none">
            <div className="max-w-3xl mx-auto flex flex-col items-center bg-black min-h-full pb-32">
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
    overlayStyle: 'hidden' | 'outline' | 'fill'
}> = ({ id, index, zip, filename, ocr, showOcr, onOcrClick, dictionaryMode, overlayStyle }) => {
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

        for (const block of ocr.blocks) {
            const [bx1, by1, bx2, by2] = block.box;
            if (svgX >= bx1 && svgX <= bx2 && svgY >= by1 && svgY <= by2) {
                e.stopPropagation();
                onOcrClick(block.lines.join('\n'), block);
                return;
            }
        }
    };

    return (
        <div 
            id={id} ref={imgRef} 
            className="w-full relative min-h-[100px] flex items-center justify-center bg-zinc-950 border-b border-zinc-900"
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
            ) : <div className="w-full h-[500px] animate-pulse bg-zinc-800" />}
        </div>
    );
};

// --- Pagination Mode Viewer ---
const PaginationViewer: React.FC<ImageViewerProps & { containerRef: React.RefObject<HTMLDivElement | null> }> = ({ 
  pages, showOcr, onOcrClick, scale, setScale, readingDirection, settings, containerRef
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);
  const inertiaRafId = useRef<number | null>(null);
  const initialDist = useRef<number | null>(null);
  const initialScale = useRef(1);

  useEffect(() => {
      const handleGlobalUp = () => {
          if (isDragging.current) {
              isDragging.current = false;
              startInertia();
          }
      };
      window.addEventListener('pointerup', handleGlobalUp);
      window.addEventListener('blur', handleGlobalUp);
      return () => {
          window.removeEventListener('pointerup', handleGlobalUp);
          window.removeEventListener('blur', handleGlobalUp);
      };
  }, []);

  useEffect(() => {
      // Sync props scale with ref
      if (Math.abs(scale - transform.current.scale) > 0.01) {
        transform.current.scale = scale;
        updateDOM();
      }
  }, [scale]);

  // Reset transform when pages (current page) changes
  useEffect(() => {
    transform.current = { x: 0, y: 0, scale: 1 };
    velocity.current = { x: 0, y: 0 };
    if (inertiaRafId.current) cancelAnimationFrame(inertiaRafId.current);
    updateDOM();
    if (scale !== 1) setScale(1); 
  }, [pages]); 

  const updateDOM = () => {
      if (contentRef.current) {
        contentRef.current.style.transform = `translate(${transform.current.x}px, ${transform.current.y}px) scale(${transform.current.scale})`;
      }
  };

  const startInertia = () => {
    // Only apply inertia if scaled up or moved significantly, but here we just drift to stop
    // If not scaled, we might want to snap back to center? 
    // Requirement: "Defaults to original display way" -> if scale is 1, center it.
    if (transform.current.scale <= 1.01) {
         // Snap back if scale is ~1
         velocity.current = {x:0, y:0};
         const snap = () => {
             transform.current.x *= 0.8;
             transform.current.y *= 0.8;
             updateDOM();
             if (Math.abs(transform.current.x) > 0.5 || Math.abs(transform.current.y) > 0.5) {
                 requestAnimationFrame(snap);
             } else {
                 transform.current.x = 0;
                 transform.current.y = 0;
                 updateDOM();
             }
         };
         requestAnimationFrame(snap);
         return;
    }

    if (Math.abs(velocity.current.x) < 0.1 && Math.abs(velocity.current.y) < 0.1) return;
    const friction = 0.92;
    const step = () => {
        if (isDragging.current) return;
        velocity.current.x *= friction; velocity.current.y *= friction;
        transform.current.x += velocity.current.x; transform.current.y += velocity.current.y;
        updateDOM();
        if (Math.abs(velocity.current.x) > 0.1 || Math.abs(velocity.current.y) > 0.1) {
            inertiaRafId.current = requestAnimationFrame(step);
        }
    };
    inertiaRafId.current = requestAnimationFrame(step);
  };

  const getDistance = (p1: React.PointerEvent, p2: React.PointerEvent) => {
      return Math.sqrt(Math.pow(p2.clientX - p1.clientX, 2) + Math.pow(p2.clientY - p1.clientY, 2));
  }

  const pointers = useRef<Map<number, React.PointerEvent>>(new Map());

  const onPointerDown = (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (inertiaRafId.current) cancelAnimationFrame(inertiaRafId.current);
      
      containerRef.current?.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, e);

      if (pointers.current.size === 1) {
          isDragging.current = true;
          startPos.current = { x: e.clientX, y: e.clientY }; 
          lastPos.current = { x: e.clientX, y: e.clientY };
          velocity.current = { x: 0, y: 0 };
      } else if (pointers.current.size === 2) {
          isDragging.current = false; 
          const p = Array.from(pointers.current.values());
          initialDist.current = getDistance(p[0], p[1]);
          initialScale.current = transform.current.scale;
      }
  };

  const onPointerMove = (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, e); 
      e.preventDefault();

      if (pointers.current.size === 2 && initialDist.current) {
          const p = Array.from(pointers.current.values());
          const dist = getDistance(p[0], p[1]);
          const newScale = Math.min(Math.max(0.5, initialScale.current * (dist / initialDist.current)), 5);
          transform.current.scale = newScale;
          updateDOM();
          return;
      }

      if (isDragging.current && pointers.current.size === 1) {
          const dx = e.clientX - lastPos.current.x;
          const dy = e.clientY - lastPos.current.y;
          velocity.current = { x: dx, y: dy }; 
          
          // Allow dragging only if scaled > 1 (or just dragging generally, but usually pan implies zoom)
          // But user asked for drag/zoom capability.
          transform.current.x += dx; 
          transform.current.y += dy;
          
          lastPos.current = { x: e.clientX, y: e.clientY };
          if (rafId.current) cancelAnimationFrame(rafId.current);
          rafId.current = requestAnimationFrame(updateDOM);
      }
  };

  const onPointerUp = (e: React.PointerEvent) => {
      pointers.current.delete(e.pointerId);
      containerRef.current?.releasePointerCapture(e.pointerId);
      
      if (pointers.current.size < 2) initialDist.current = null;
      
      if (pointers.current.size === 0 && isDragging.current) {
          isDragging.current = false;
          
          const dist = Math.sqrt(Math.pow(e.clientX - startPos.current.x, 2) + Math.pow(e.clientY - startPos.current.y, 2));
          if (dist < 5) {
               // Click handling for OCR
               if (!contentRef.current) return;
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

                           for (const block of page.ocr.blocks) {
                               const [bx1, by1, bx2, by2] = block.box;
                               if (svgX >= bx1 && svgX <= bx2 && svgY >= by1 && svgY <= by2) {
                                   onOcrClick(block.lines.join('\n'), block);
                                   return; 
                               }
                           }
                       }
                   }
               }
          } else {
              startInertia();
          }
      } else if (pointers.current.size === 1) {
          const p = pointers.current.values().next().value;
          lastPos.current = { x: p.clientX, y: p.clientY };
          isDragging.current = true;
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
      className="w-full h-full overflow-hidden bg-black relative flex items-center justify-center cursor-grab touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={(e) => {
          if (e.ctrlKey) {
             e.preventDefault();
             const newScale = Math.min(Math.max(0.5, transform.current.scale - e.deltaY * 0.01), 5);
             transform.current.scale = newScale;
             updateDOM();
          }
      }}
    >
      <div 
        ref={contentRef}
        className={`relative flex items-center justify-center gap-2 ${readingDirection === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}
        style={{ transformOrigin: 'center' }}
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
                return 'fill-transparent stroke-transparent pointer-events-none';
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
