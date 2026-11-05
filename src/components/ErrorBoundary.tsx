import { Component, type ReactNode } from 'react';

interface Props {
  /** 어느 영역인지 (안내 문구용) */
  name: string;
  /** 이 값이 바뀌면 (예: 새 데이터, 다른 선택) 오류 상태를 풀고 다시 그려 본다 */
  resetKey?: unknown;
  children: ReactNode;
}

/** 한 영역에서 난 오류가 화면 전체를 하얗게 만들지 않도록 그 영역만 안내로 바꾼다 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.name}]`, error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-box" role="alert">
        <b>{this.props.name}을(를) 표시하지 못했어요</b>
        <span>데이터 형식이 예상과 다를 수 있어요.</span>
        <button className="chip" onClick={() => this.setState({ error: null })}>다시 시도</button>
      </div>
    );
  }
}
