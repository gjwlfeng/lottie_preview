// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import path = require('path');
import fs = require('fs');
const { init, localize } = require("vscode-nls-i18n");

var isVsCodeApiInitialized = false;

var outputChannel: vscode.LogOutputChannel;  // 输出通道

/**
 * 输出信息到控制台上，输出通道为MyCoder
 * @param message 输出的文本信息
 */
export function myLog() {
	if (outputChannel === undefined) {
		outputChannel = vscode.window.createOutputChannel('lottie-preview', {
			log: true,
		});
	}
	return outputChannel;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	myLog().info('lottie-preview is now active!');

	init(context.extensionPath);

	let needPreviewJsonUriMap: Map<string, vscode.Uri> = new Map();
	let webViewProviderMap: Map<string, (LottiePreviewViewProvider | undefined)> = new Map();

	let onDidDispose: (fileUri?: vscode.Uri) => void = (fileUri) => {
		if (fileUri !== undefined) {
			webViewProviderMap.delete(fileUri.toString())
		}
	};
5
	let onDidReceiveMessage: (data: any, fileUri?: vscode.Uri) => any = (data, fileUri?) => {
		switch (data.type) {
			case 'vs_code_api_initialized': {
				isVsCodeApiInitialized = true;

				myLog().info("web vscode api initialized")

				//处理还没有处理的资源
				let tempNeedPreviewJsonUriMap: Map<string, vscode.Uri> = new Map();
				needPreviewJsonUriMap.forEach((value, key) => {
					tempNeedPreviewJsonUriMap.set(key, value);
				})
				needPreviewJsonUriMap.clear();

				tempNeedPreviewJsonUriMap.forEach((value, key) => {
					vscode.commands.executeCommand("lottie-preview.lottie_preview", value, [value]).then((value) => {
						myLog().info(`invoke lottie preview success!`);
					}, (reson) => {
						myLog().info(`invoke lottie preview failure!${reson}`);
					})
				})
				tempNeedPreviewJsonUriMap.clear();

				break;
			}
			default: {
				myLog().info(`Unrecognized command(${data})!`);
			}

		}
	};

	vscode.window.registerWebviewPanelSerializer(LottiePreviewViewProvider.viewType, new LottiePreviewViewSerializer((webviewPanel: vscode.WebviewPanel, state: any) => {
		let provide: LottiePreviewViewProvider = new LottiePreviewViewProvider(context, onDidReceiveMessage, onDidDispose, vscode.Uri.parse(state.lottie.uri));
		provide.init(webviewPanel);
		webViewProviderMap.set(state.lottie.uri, provide)
	}),);

	let lottiePreviewDisposable = vscode.commands.registerCommand('lottie-preview.lottie_preview', async (focusUri: vscode.Uri, selectedUris: vscode.Uri[]) => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		myLog().info(`lottie_preview--------------------`);

		if (focusUri === null) {
			let msg = "Please select a lottie json file!"
			vscode.window.showErrorMessage(msg);
			myLog().error(msg);
			return;
		}

		const focusFile = fs.lstatSync(focusUri.fsPath);
		if (!focusFile.isFile()) {
			let msg = "Please select a lottie json file!"
			vscode.window.showErrorMessage(msg);
			myLog().error(msg);
			return;
		}

		const columnToShowIn = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		let webViewProvider = webViewProviderMap.get(focusUri.toString())

		if (webViewProvider === undefined) {
			webViewProvider = new LottiePreviewViewProvider(context, onDidReceiveMessage, onDidDispose, focusUri);
			webViewProvider.init();
			webViewProviderMap.set(focusUri.toString(), webViewProvider);
		} else {
			webViewProvider.reveal(columnToShowIn);
		}

		if (isVsCodeApiInitialized) {
			webViewProvider.preview(focusUri)
		} else {

			myLog().info("web vscode api not initialize !");

			if (!needPreviewJsonUriMap.has(focusUri.toString())) {
				needPreviewJsonUriMap.set(focusUri.toString(), focusUri);
			}
		}
	});

	context.subscriptions.push(
		lottiePreviewDisposable)
}

// This method is called when your extension is deactivated
export function deactivate() {
	myLog().info('lottie-preview is now deactivate!');
}

class LottiePreviewViewProvider {

	public static readonly viewType = 'lottie-preview';

	private _selectUri?: vscode.Uri;
	private _view?: vscode.WebviewPanel;
	private _context?: vscode.ExtensionContext;
	private _onDidDispose?: (fileUri?: vscode.Uri) => void;
	private _onDidReceiveMessage?: (data: any, fileUri?: vscode.Uri,) => any;
	private _disposables: vscode.Disposable[] = [];

	constructor(
		context: vscode.ExtensionContext,
		onDidReceiveMessage: (data: any) => any,
		didDispose: () => void,
		selectUri?: vscode.Uri,

	) {
		this._context = context;
		this._selectUri = selectUri;
		this._onDidReceiveMessage = onDidReceiveMessage;
		this._onDidDispose = didDispose;

	}

	public reveal(viewColumn?: vscode.ViewColumn) {
		this._view?.reveal(viewColumn);
	}

	public asWebviewUri(localResource: vscode.Uri): vscode.Uri {
		return this._view!!.webview.asWebviewUri(localResource);
	}

	public postMessage(data: any): Thenable<boolean> {
		return this._view!!.webview.postMessage(data);
	}

	public init(): void;

	public init(view?: vscode.WebviewPanel | undefined): void;

	public init(view?: vscode.WebviewPanel) {
		if (view !== undefined) {
			this._view = view!!;
		} else {
			const isResidentMemory = vscode.workspace.getConfiguration().get<boolean>("lottie-preview.is_resident_memory") || false;
			this._view = vscode.window.createWebviewPanel(
				LottiePreviewViewProvider.viewType,
				path.basename(this._selectUri?.path ? this._selectUri?.path : ""),
				vscode.ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: isResidentMemory
				}
			);
		}
		// And set its HTML content
		this._view.webview.html = this.getHtmlForWebview();

		// this._view.onDidChangeViewState(data => {
		// myLog().info("onDidChangeViewState=" + data);
		// }, this, this._disposables);

		this._view.webview.onDidReceiveMessage(data => {
			myLog().info("onDidReceiveMessage=" + JSON.stringify(data));
			this._onDidReceiveMessage?.call(this, data, this._selectUri);
		}, this, this._disposables);

		this._view.onDidDispose(
			() => {
				this._onDidDispose?.call(this, this._selectUri);
				this._disposables.forEach((item) => {
					item.dispose();
				});
				this._view = undefined;
				this._context = undefined;
				this._onDidReceiveMessage = undefined;
				this._onDidDispose = undefined;
			},
			this, this._disposables
		);

	}

	public preview(selectUri: vscode.Uri) {
		if (this._view) {
			let webView: vscode.Webview = this._view.webview;

			myLog().info(`postMessage lottie preview msg!`);

			webView.postMessage({
				type: 'lottie_preview', data: {
					uri: selectUri.toString(),
					path: webView.asWebviewUri(vscode.Uri.file(selectUri.fsPath)).toString()
				}
			})

		} else {
			myLog().error(`_view is null!`);
		}
	}

	private getHtmlForWebview() {

		const jsFilePath =
			vscode.Uri.joinPath(this._context!.extensionUri, 'template', 'index.js');
		const cssFilePath =
			vscode.Uri.joinPath(this._context!.extensionUri, 'template', 'index.css');


		let jsUrl = this._view!!.webview.asWebviewUri(jsFilePath).toString();
		let cssUrl = this._view!!.webview.asWebviewUri(cssFilePath).toString();

		// data-vscode-context='{"webviewSection": "editor", "preventDefaultContextMenuItems": true}'

		return `<!DOCTYPE html>
		<html lang="en" data-vscode-context='{"webviewSection": "editor", "preventDefaultContextMenuItems": true}'>
		  <head>
			<meta charset="UTF-8">
			<link rel="icon" href="/favicon.ico">
			
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Image Preview View</title>
			
			<script type="module" crossorigin src="${jsUrl}"></script>
			
			<link rel="stylesheet" href="${cssUrl}">
		  </head>
		  <body >
			<div id="app"></div>
		  </body>
		</html>`;

	}
}

class LottiePreviewViewSerializer implements vscode.WebviewPanelSerializer {

	private _onDeserializeWebviewPanel: (webviewPanel: vscode.WebviewPanel, state: any) => void;


	constructor(onDeserializeWebviewPanel: (webviewPanel: vscode.WebviewPanel, state: any) => void) {
		this._onDeserializeWebviewPanel = onDeserializeWebviewPanel;
	}

	async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
		// `state` is the state persisted using `setState` inside the webview
		console.log(`Got state: ${state}`);
		this._onDeserializeWebviewPanel(webviewPanel, state);
	}
}

class DataStorage {
	context: vscode.ExtensionContext;
	key: string;

	constructor(context: vscode.ExtensionContext, key: string) {
		this.context = context;
		this.key = key;
		context.globalState.setKeysForSync([key]);
	}

	/**
	 * 
	 * 添加图片主题
	 */
	public addImageTheme(imagePath: string, theme: number) {
		let themeList = this.context.globalState.get(this.key) as any[] | undefined;
		if (themeList === undefined) {
			themeList = [];
		}

		let curTheme = themeList.find((theme) => {
			return theme.imagePath === imagePath;
		});

		if (curTheme === undefined) {
			themeList.push({
				imagePath,
				theme
			});
		} else {
			curTheme.theme = theme;
		}

		this.context.globalState.update(this.key, themeList);
	}

	/**
	 * 
	 * 根据图片路径获取单个图片主题
	 */
	public getImageTheme(imagePath: string): any {
		let themeList = this.context.globalState.get(this.key) as any[] | undefined;
		if (themeList === undefined) {
			themeList = [];
		}
		let iamgeTheme = themeList.find((item) => {
			return item.imagePath === imagePath;
		});
		return iamgeTheme;
	}

	/**
	 * 
	 * 根据图片路径删除图片主题
	 */
	public removeImageTheme(imagePath: string) {
		let themeList = this.context.globalState.get(this.key) as any[] | undefined;
		if (themeList === undefined) {
			themeList = [];
		}

		let newThemeList: any[] = [];
		themeList.forEach((item) => {
			if (item.imagePath !== imagePath) {
				newThemeList.push(item);
			}
		});
		this.context.globalState.update(this.key, newThemeList);
	}

	/**
	 * 
	 * @returns 所有图片主题
	 */
	public getAllImageTheme(): any[] {
		let themeList = this.context.globalState.get(this.key) as any[] | undefined;
		if (themeList === undefined) {
			themeList = [];
		}
		return themeList;
	}

}
