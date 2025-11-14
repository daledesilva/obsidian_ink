import './tldraw-drawing-editor.scss';
import {
  Editor,
  HistoryEntry,
  TLRecord,
  TLUiOverrides,
  TldrawEditor,
  TldrawHandles,
  TldrawOptions,
  TldrawScribble,
  TldrawSelectionBackground,
  TldrawSelectionForeground,
  TldrawShapeIndicators,
  defaultShapeTools,
  defaultShapeUtils,
  defaultTools,
  getSnapshot,
  TLEditorSnapshot,
} from "@tldraw/tldraw";
import { useRef } from 'react';
import {
  Activity,
  adaptTldrawToObsidianThemeMode,
  focusChildTldrawEditor,
  getActivityType,
  getDrawingSvg,
  initDrawingCamera,
  prepareDrawingSnapshot,
  preventTldrawCanvasesCausingObsidianGestures,
} from '../../utils/tldraw-helpers';
import InkPlugin from '../../main';
import * as React from 'react';
import { TFile } from 'obsidian';
import { InkFileData, buildDrawingFileData } from 'src/utils/page-file';
import { DRAW_SHORT_DELAY_MS, DRAW_LONG_DELAY_MS } from 'src/constants';
import { PrimaryMenuBar } from '../primary-menu-bar/primary-menu-bar';
import DrawingMenu from '../drawing-menu/drawing-menu';
import ExtendedDrawingMenu from '../extended-drawing-menu/extended-drawing-menu';
import classNames from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import { DrawingEmbedState, editorActiveAtom, embedStateAtom } from './drawing-embed';
import { getInkFileData } from 'src/utils/getInkFileData';
import { ResizeHandle } from 'src/components/jsx-components/resize-handle/resize-handle';
import { verbose } from 'src/utils/log-to-console';
import { SecondaryMenuBar } from '../secondary-menu-bar/secondary-menu-bar';
import ModifyMenu from '../modify-menu/modify-menu';

interface TldrawDrawingEditorProps {
  onReady?: Function;
  plugin: InkPlugin;
  drawingFile: TFile;
  save: (pageData: InkFileData) => void;
  extendedMenu?: any[];

  // For embeds
  embedded?: boolean;
  resizeEmbed?: (pxWidthDiff: number, pxHeightDiff: number) => void;
  closeEditor?: Function;
  saveControlsReference?: Function;
}

// Wraps the component so that it can full unmount when inactive
export const TldrawDrawingEditorWrapper: React.FC<TldrawDrawingEditorProps> = (props) => {
  const editorActive = useAtomValue(editorActiveAtom);
  if (editorActive) return <TldrawDrawingEditor {...props} />;
  return <></>;
};

const myOverrides: TLUiOverrides = {};

const tlOptions: Partial<TldrawOptions> = {
  defaultSvgPadding: 10,
};

// Zoom constants for z-drag zoom
const ZOOM_SENSITIVITY = 0.003; // vertical pixel sensitivity for zoom
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

export function TldrawDrawingEditor(props: TldrawDrawingEditorProps) {
  const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>();
  const setEmbedState = useSetAtom(embedStateAtom);
  const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
  const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
  const tlEditorRef = useRef<Editor>();
  const editorWrapperRefEl = useRef<HTMLDivElement>(null);

  // Space / z key and gesture state
  const isSpaceHeldRef = useRef(false);
  const isZHeldRef = useRef(false);
  const panDraggingRef = useRef(false);
  const zoomDraggingRef = useRef(false);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const relockAfterGestureRef = useRef(false);

  React.useEffect(() => {
    verbose('EDITOR mounted');
    fetchFileData();
    return () => {
      verbose('EDITOR unmounting');
    };
  }, []);

  if (!tlEditorSnapshot) return <></>;
  verbose('EDITOR snapshot loaded');

  const defaultComponents = {
    Scribble: TldrawScribble,
    ShapeIndicators: TldrawShapeIndicators,
    CollaboratorScribble: TldrawScribble,
    SelectionForeground: TldrawSelectionForeground,
    SelectionBackground: TldrawSelectionBackground,
    Handles: TldrawHandles,
  };

  const handleMount = (_editor: Editor) => {
    const editor = (tlEditorRef.current = _editor);
    setEmbedState(DrawingEmbedState.editor);
    focusChildTldrawEditor(editorWrapperRefEl.current);
    preventTldrawCanvasesCausingObsidianGestures(editor);

    adaptTldrawToObsidianThemeMode(editor);
    editor.updateInstanceState({ isGridMode: true });

    initDrawingCamera(editor);
    if (props.embedded) {
      editor.setCameraOptions({ isLocked: true });
    }

    if (editorWrapperRefEl.current) {
      editorWrapperRefEl.current.style.opacity = '1';
    }

    const removeUserActionListener = editor.store.listen(
      (entry: HistoryEntry<TLRecord>) => {
        const activity = getActivityType(entry);
        switch (activity) {
          case Activity.PointerMoved:
          case Activity.CameraMovedAutomatically:
          case Activity.CameraMovedManually:
            break;

          case Activity.DrawingStarted:
          case Activity.DrawingContinued:
            resetInputPostProcessTimers();
            break;

          case Activity.DrawingCompleted:
            queueOrRunStorePostProcesses(editor);
            embedPostProcess(editor);
            break;

          case Activity.DrawingErased:
            queueOrRunStorePostProcesses(editor);
            embedPostProcess(editor);
            break;

          default:
            queueOrRunStorePostProcesses(editor);
            verbose('Activity not recognised.');
            verbose(['entry', entry], { freeze: true });
        }
      },
      { source: 'user', scope: 'all' }
    );

    const unmountActions = () => {
      resetInputPostProcessTimers();
      removeUserActionListener();
    };

    if (props.saveControlsReference) {
      props.saveControlsReference({
        save: () => completeSave(editor),
        saveAndHalt: async (): Promise<void> => {
          await completeSave(editor);
          unmountActions();
        },
      });
    }

    if (props.onReady) props.onReady();

    return () => {
      unmountActions();
    };
  };

  // Key handlers: Undo/Redo + Space/Z gestures
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const editor = tlEditorRef.current;
    if (!editor) return;
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();

    // Undo
    if (modKey && !e.shiftKey && key === 'z') {
      e.preventDefault();
      editor.undo();
      return;
    }
    // Redo
    if (modKey && ((e.shiftKey && key === 'z') || key === 'y')) {
      e.preventDefault();
      editor.redo();
      return;
    }

    // Space for pan (non-mod combo)
    if (e.code === 'Space') {
      isSpaceHeldRef.current = true;
      e.preventDefault(); // prevent page scroll on space
      return;
    }

    // z for zoom drag (non-mod combo)
    if (!modKey && key === 'z') {
      isZHeldRef.current = true;
      e.preventDefault();
      return;
    }

	// 删除选中（光标模式）
	if (!modKey && (key === 'backspace' || key === 'delete')) {
		const toolId = (tlEditorRef.current as any)?.getCurrentToolId?.() ?? '';
		const isSelectTool = toolId === 'select';
		// 若处于文本编辑状态则不拦截退格
		const isEditing = !!(tlEditorRef.current as any)?.getEditingShapeId?.();

		if (isSelectTool && !isEditing) {
			const ids = tlEditorRef.current!.getSelectedShapeIds();
		if (ids.length > 0) {
			e.preventDefault(); // 防止浏览器后退/默认行为
			tlEditorRef.current!.deleteShapes(ids);
			return;
		}
		}
	}
  }
	


  function handleKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    const key = e.key.toLowerCase();

    if (e.code === 'Space') {
      isSpaceHeldRef.current = false;
      if (panDraggingRef.current) endDrag();
      e.preventDefault();
      return;
    }
    if (!e.ctrlKey && !e.metaKey && key === 'z') {
      isZHeldRef.current = false;
      if (zoomDraggingRef.current) endDrag();
      e.preventDefault();
      return;
    }
  }

  function handleBlur() {
    // Reset gesture states on blur
    isSpaceHeldRef.current = false;
    isZHeldRef.current = false;
    if (panDraggingRef.current || zoomDraggingRef.current) endDrag();
  }

  // Camera helpers
  function getCamera(editor: Editor): any {
    return (editor as any).getCamera();
  }
  function getZoom(editor: Editor): number {
    const cam = getCamera(editor);
    return cam.zoom ?? cam.z ?? 1;
  }
  function setCamera(editor: Editor, patch: any) {
    (editor as any).setCamera(patch);
  }
  function setZoom(editor: Editor, newZoom: number) {
    const cam = getCamera(editor);
    const patch: any = { ...cam };
    if ('zoom' in cam) patch.zoom = newZoom;
    else patch.z = newZoom;
    setCamera(editor, patch);
  }
  function clampZoom(z: number): number {
    if (z < MIN_ZOOM) return MIN_ZOOM;
    if (z > MAX_ZOOM) return MAX_ZOOM;
    return z;
  }
  function panCameraBy(editor: Editor, dx: number, dy: number) {
    const cam = getCamera(editor);
    const z = cam.zoom ?? cam.z ?? 1;
    // 让内容跟着指针移动：加号
    const patch: any = { ...cam, x: cam.x + dx / z, y: cam.y + dy / z };
    setCamera(editor, patch);
  }
  // 按屏幕坐标（相对编辑器容器）将缩放锚定到指针位置
  function zoomCameraAtScreen(editor: Editor, targetZoom: number, sx: number, sy: number) {
    const cam = getCamera(editor);
    const z = cam.zoom ?? cam.z ?? 1;
    const newZoom = clampZoom(targetZoom);

    // screen = (world - cam) * z  =>  world = cam + screen / z
    const worldX = cam.x + sx / z;
    const worldY = cam.y + sy / z;

    const patch: any = { ...cam };
    patch.x = worldX - sx / newZoom;
    patch.y = worldY - sy / newZoom;
    if ('zoom' in cam) patch.zoom = newZoom;
    else patch.z = newZoom;

    setCamera(editor, patch);
  }
  function getScreenPointInEditor(e: React.PointerEvent<HTMLDivElement>) {
    const rect = editorWrapperRefEl.current?.getBoundingClientRect();
    const sx = e.clientX - (rect?.left ?? 0);
    const sy = e.clientY - (rect?.top ?? 0);
    return { sx, sy };
  }

  // Pointer capture handlers for pen/mouse/touch gestures on Space/Z
  function onPointerDownCapture(e: React.PointerEvent<HTMLDivElement>) {
    const editor = tlEditorRef.current;
    if (!editor) return;

    const isKeyHeld = isSpaceHeldRef.current || isZHeldRef.current;
    const isDesiredPointer =
      e.pointerType === 'pen' ||
      e.pointerType === 'mouse' ||
      e.pointerType === 'touch';

    // For mouse, only respond to primary button
    const primaryMouse = e.pointerType !== 'mouse' || e.button === 0 || (e.buttons & 1) === 1;

    if (!isKeyHeld || !isDesiredPointer || !primaryMouse) return;

    lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
    pointerIdRef.current = e.pointerId;

    if (props.embedded) {
      // temporarily unlock camera while gesture
      (tlEditorRef.current as any)?.setCameraOptions?.({ isLocked: false });
      relockAfterGestureRef.current = true;
    }

    // If both held, zoom takes priority; otherwise pick based on held key
    if (isZHeldRef.current) {
      zoomDraggingRef.current = true;
      panDraggingRef.current = false;
    } else if (isSpaceHeldRef.current) {
      panDraggingRef.current = true;
      zoomDraggingRef.current = false;
    }

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    // 避免 passive 报错：不调用 preventDefault，依赖 touch-action: none
    e.stopPropagation();
  }

  function onPointerMoveCapture(e: React.PointerEvent<HTMLDivElement>) {
    const editor = tlEditorRef.current;
    if (!editor) return;
    if (!panDraggingRef.current && !zoomDraggingRef.current) return;

    const last = lastPointerPosRef.current;
    if (!last) return;

    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY };

    if (panDraggingRef.current) {
      panCameraBy(editor, dx, dy);
    } else if (zoomDraggingRef.current) {
      const currentZoom = getZoom(editor);
      let targetZoom = currentZoom * Math.exp(-dy * ZOOM_SENSITIVITY);
      targetZoom = clampZoom(targetZoom);

      // 以鼠标/触控当前位置为缩放锚点
      const { sx, sy } = getScreenPointInEditor(e);
      zoomCameraAtScreen(editor, targetZoom, sx, sy);
    }

    e.stopPropagation();
  }

  function onPointerUpCapture(e: React.PointerEvent<HTMLDivElement>) {
    if (!panDraggingRef.current && !zoomDraggingRef.current) return;
    endDrag();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    e.stopPropagation();
  }

  function endDrag() {
    panDraggingRef.current = false;
    zoomDraggingRef.current = false;
    lastPointerPosRef.current = null;
    pointerIdRef.current = null;

    if (props.embedded && relockAfterGestureRef.current) {
      (tlEditorRef.current as any)?.setCameraOptions?.({ isLocked: true });
      relockAfterGestureRef.current = false;
    }
  }

  // Helper functions
  ///////////////////

  async function fetchFileData() {
    const inkFileData = await getInkFileData(props.plugin, props.drawingFile);
    if (inkFileData.tldraw) {
      const snapshot = prepareDrawingSnapshot(inkFileData.tldraw as TLEditorSnapshot);
      setTlEditorSnapshot(snapshot);
    }
  }

  const embedPostProcess = (_editor: Editor) => {
    // resizeContainerIfEmbed(editor);
  };

  const queueOrRunStorePostProcesses = (editor: Editor) => {
    instantInputPostProcess(editor);
    smallDelayInputPostProcess(editor);
    longDelayInputPostProcess(editor);
  };

  const instantInputPostProcess = (_editor: Editor) => {
    // e.g. simplifyLines(editor);
  };

  const smallDelayInputPostProcess = (editor: Editor) => {
    resetShortPostProcessTimer();
    shortDelayPostProcessTimeoutRef.current = setTimeout(() => {
      incrementalSave(editor);
    }, DRAW_SHORT_DELAY_MS);
  };

  const longDelayInputPostProcess = (editor: Editor) => {
    resetLongPostProcessTimer();
    longDelayPostProcessTimeoutRef.current = setTimeout(() => {
      completeSave(editor);
    }, DRAW_LONG_DELAY_MS);
  };

  const resetShortPostProcessTimer = () => {
    clearTimeout(shortDelayPostProcessTimeoutRef.current);
  };
  const resetLongPostProcessTimer = () => {
    clearTimeout(longDelayPostProcessTimeoutRef.current);
  };
  const resetInputPostProcessTimers = () => {
    resetShortPostProcessTimer();
    resetLongPostProcessTimer();
  };

  const incrementalSave = async (editor: Editor) => {
    verbose('incrementalSave');
    const tlEditorSnapshot = getSnapshot(editor.store);
    const pageData = buildDrawingFileData({
      tlEditorSnapshot,
      previewIsOutdated: true,
    });
    props.save(pageData);
  };

  const completeSave = async (editor: Editor): Promise<void> => {
    verbose('completeSave');
    let previewUri;

    const tlEditorSnapshot = getSnapshot(editor.store);
    const svgObj = await getDrawingSvg(editor);

    if (svgObj) {
      previewUri = svgObj.svg;
    }

    if (previewUri) {
      const pageData = buildDrawingFileData({
        tlEditorSnapshot,
        previewUri,
      });
      props.save(pageData);
    } else {
      const pageData = buildDrawingFileData({
        tlEditorSnapshot,
      });
      props.save(pageData);
    }
  };

  const getTlEditor = (): Editor | undefined => tlEditorRef.current;

  const customExtendedMenu = [
    {
      text: 'Grid on/off',
      action: () => {
        const editor = getTlEditor();
        if (editor) {
          editor.updateInstanceState({ isGridMode: !editor.getInstanceState().isGridMode });
        }
      },
    },
    ...(props.extendedMenu || []),
  ];

  return (
    <>
      <div
        ref={editorWrapperRefEl}
        className={classNames(['ddc_ink_drawing-editor'])}
        style={{
          height: '100%',
          position: 'relative',
          opacity: 0,
          touchAction: 'none',         // 禁用浏览器默认触控手势
          overscrollBehavior: 'contain',
          userSelect: 'none',
        }}
        tabIndex={0}
        onKeyDownCapture={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={handleBlur}
        onPointerDownCapture={onPointerDownCapture}
        onPointerMoveCapture={onPointerMoveCapture}
        onPointerUpCapture={onPointerUpCapture}
        onPointerCancelCapture={onPointerUpCapture}
        onPointerDown={() => editorWrapperRefEl.current?.focus({ preventScroll: true })}
      >
        <TldrawEditor
          options={tlOptions}
          shapeUtils={[...defaultShapeUtils]}
          tools={[...defaultTools, ...defaultShapeTools]}
          initialState="draw"
          overrides={myOverrides}
          snapshot={tlEditorSnapshot}
          components={defaultComponents}
          onMount={handleMount}
          autoFocus={false}
        />

        <PrimaryMenuBar>
          <DrawingMenu getTlEditor={getTlEditor} onStoreChange={(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)} />
          {props.embedded && props.extendedMenu && (
            <ExtendedDrawingMenu
              onLockClick={async () => {
                if (props.closeEditor) props.closeEditor();
              }}
              menuOptions={customExtendedMenu}
            />
          )}
          {!props.embedded && props.extendedMenu && <ExtendedDrawingMenu menuOptions={customExtendedMenu} />}
        </PrimaryMenuBar>
        <SecondaryMenuBar>
          <ModifyMenu getTlEditor={getTlEditor} onStoreChange={(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)} />
        </SecondaryMenuBar>
      </div>

      {props.resizeEmbed && <ResizeHandle resizeEmbed={resizeEmbed} />}
    </>
  );

  function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
    if (!props.resizeEmbed) return;
    props.resizeEmbed(pxWidthDiff, pxHeightDiff);
  }
}