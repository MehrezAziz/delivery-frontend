import { View, Text, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

export default function CustomerLoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // TODO: Implement login logic
    console.log('Login:', { phone, password });
    router.replace('/(customer)/home');
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 px-6 pt-16">
          {/* Back Button */}
          <TouchableOpacity 
            onPress={() => router.back()}
            className="mb-8"
          >
            <Text className="text-primary-600 text-lg">← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View className="mb-12">
            <Text className="text-4xl font-bold text-gray-900 mb-2">
              Welcome Back
            </Text>
            <Text className="text-lg text-gray-600">
              Login to your customer account
            </Text>
          </View>

          {/* Form */}
          <View className="space-y-6">
            <View>
              <Text className="text-gray-700 font-medium mb-2">Phone Number</Text>
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-xl px-4 py-4 text-base"
                placeholder="+216 XX XXX XXX"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            <View>
              <Text className="text-gray-700 font-medium mb-2">Password</Text>
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-xl px-4 py-4 text-base"
                placeholder="Enter your password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity>
              <Text className="text-primary-600 text-right font-medium">
                Forgot Password?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-primary-600 py-4 rounded-xl shadow-lg mt-4"
              onPress={handleLogin}
            >
              <Text className="text-white text-center text-lg font-semibold">
                Login
              </Text>
            </TouchableOpacity>

            {/* Register Link */}
            <View className="flex-row justify-center items-center mt-6">
              <Text className="text-gray-600">Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/customer-register')}>
                <Text className="text-primary-600 font-semibold">Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
