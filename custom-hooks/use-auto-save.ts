'use client';
import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { AutoSaveManager } from '@/lib/client/auto-save';

export function useAutoSave(): void {
  const managerRef = useRef<AutoSaveManager | null>(null);

  useEffect(() => {
    const manager = new AutoSaveManager();
    managerRef.current = manager;

    const unsub = useEditorStore.subscribe((state, prevState) => {
      if (state.buffer !== prevState.buffer && state.selectedFile) {
        manager.schedule(state.selectedFile, state.buffer, state.bucketName);
      }
    });

    return () => {
      unsub();
      manager.destroy();
    };
  }, []);
}
