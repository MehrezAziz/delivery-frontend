import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import i18n from '../i18n';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class GlobalErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || i18n.t('globalErrors.unexpectedAppErrorBadge'),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('GlobalErrorBoundary caught error:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={s.wrap}>
        <Text style={s.emoji}>😵‍💫</Text>
        <Text style={s.title}>{i18n.t('globalErrorBoundary.title')}</Text>
        <Text style={s.text}>{i18n.t('globalErrorBoundary.body')}</Text>
        <Text style={s.reason}>{this.state.message}</Text>
        <TouchableOpacity style={s.button} onPress={this.handleRetry} activeOpacity={0.85}>
          <Text style={s.buttonText}>{i18n.t('globalErrorBoundary.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emoji: {
    fontSize: 42,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 10,
  },
  text: {
    color: '#334155',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
  },
  reason: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
