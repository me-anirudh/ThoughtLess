"use client";
import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount, type BeforeMount, type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface CodeEditorProps {
	value: string;
	onChange: (value: string) => void;
	language?: string;
	path: string;
	fileVersion : number; 
}

const defineNightOwlTheme = (monaco: Monaco) => {
	monaco.editor.defineTheme('night-owl', {
		base: 'vs-dark',
		inherit: true,
		rules: [
			{ token: '', foreground: 'd6deeb', background: '011627' },
			{ token: 'comment', foreground: '637777', fontStyle: 'italic' },
			{ token: 'string', foreground: 'ecc48d' },
			{ token: 'string.escape', foreground: '7fdbca' },
			{ token: 'number', foreground: 'f78c6c' },
			{ token: 'keyword', foreground: 'c792ea', fontStyle: 'italic' },
			{ token: 'keyword.control', foreground: 'c792ea', fontStyle: 'italic' },
			{ token: 'operator', foreground: '7fdbca' },
			{ token: 'type', foreground: 'ffcb8b' },
			{ token: 'storage', foreground: 'c792ea' },
			{ token: 'function', foreground: '82aaff' },
			{ token: 'identifier', foreground: 'd6deeb' },
			{ token: 'variable', foreground: 'd6deeb' },
			{ token: 'variable.parameter', foreground: 'd7dbe0' },
			{ token: 'tag', foreground: '7fdbca' },
			{ token: 'tag.id', foreground: '82aaff' },
			{ token: 'tag.class', foreground: '82aaff' },
			{ token: 'attribute.name', foreground: 'addb67', fontStyle: 'italic' },
			{ token: 'attribute.value', foreground: 'ecc48d' },
			{ token: 'delimiter', foreground: 'd6deeb' },
			{ token: 'delimiter.bracket', foreground: '7fdbca' },
		],
		colors: {
			'editor.background': '#011627',
			'editor.foreground': '#d6deeb',
			'editorCursor.foreground': '#80a4c2',
			'editor.lineHighlightBackground': '#0003',
			'editorLineNumber.foreground': '#4b6479',
			'editorLineNumber.activeForeground': '#c5e4fd',
			'editor.selectionBackground': '#1d3b53',
			'editor.inactiveSelectionBackground': '#7e57c25a',
			'editor.selectionHighlightBackground': '#5f7e9779',
			'editorWhitespace.foreground': '#ffffff15',
			'editorIndentGuide.background1': '#5e81ce30',
			'editorIndentGuide.activeBackground1': '#7e97ac',
			'editorGutter.background': '#011627',
			'editorBracketMatch.background': '#5f7e974d',
			'editorBracketMatch.border': '#5f7e97',
			'editorOverviewRuler.border': '#011627',
			'scrollbarSlider.background': '#084d8180',
			'scrollbarSlider.hoverBackground': '#084d81aa',
			'scrollbarSlider.activeBackground': '#084d81dd',
			'editorWidget.background': '#021320',
			'editorWidget.border': '#5f7e97',
			'editorSuggestWidget.background': '#0b253a',
			'editorSuggestWidget.border': '#1f384c',
			'editorSuggestWidget.foreground': '#d6deeb',
			'editorSuggestWidget.selectedBackground': '#1d3b53',
			'editorSuggestWidget.highlightForeground': '#82aaff',
		}
	});
};

export default function CodeEditor({ value, onChange, language = "plaintext", path, fileVersion }: CodeEditorProps) {
	const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
	const isSettingValue = useRef(false);

	const handleBeforeMount: BeforeMount = useCallback((monaco) => {
		defineNightOwlTheme(monaco);
	}, []);
	
	const handleMount: OnMount = useCallback((editorInstance, monaco) => {
		editorRef.current = editorInstance;
		defineNightOwlTheme(monaco);
		monaco.editor.setTheme('night-owl');
		editorInstance.focus();
	}, []);

	const handleChange = useCallback(
		(newValue: string | undefined) => {
			if (isSettingValue.current) return;
			onChange(newValue ?? "");
		},
		[onChange],
	);

	useEffect(() => {
		if (!editorRef.current) return;
		isSettingValue.current = true;
		editorRef.current.setValue(value);
		isSettingValue.current = false;
		editorRef.current.focus();
	}, [path, fileVersion]);

	return (
		<Editor
			height="100%"
			language={language}
			path={path}
			theme="night-owl"
			defaultValue={value}
			beforeMount={handleBeforeMount}
			onMount={handleMount}
			onChange={handleChange}
			loading={
				<div className="flex items-center justify-center h-full bg-[#011627] text-[#5f7e97] text-sm">
					Loading editor…
				</div>
			}
			options={{
				// User-specified Shades of Purple settings
				fontFamily: "Operator Mono, Menlo, Monaco, 'Courier New', monospace",
				fontSize: 17,
				lineHeight: 24.65,
				letterSpacing: 0.5,
				fontWeight: "400",
				fontLigatures: true,

				// Cursor Settings
				cursorStyle: "line",
				cursorWidth: 5,
				cursorBlinking: "solid",

				// Editor Behavior
				renderWhitespace: "all",
				snippetSuggestions: "top",
				glyphMargin: true,

				// General Visuals
				minimap: { enabled: true },
				scrollBeyondLastLine: false,
				automaticLayout: true,
				tabSize: 2,
				wordWrap: "on",
				padding: { top: 16 },
				smoothScrolling: true,
				renderLineHighlight: "all",
				bracketPairColorization: { enabled: true },
				guides: {
					bracketPairs: true,
					indentation: true,
				},
			}}
		/>
	);
}
