import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-white">
      <StatusBar style="dark" />
      
      {/* Hero Section */}
      <View className="flex-1 justify-center items-center px-6">
        <View className="w-32 h-32 bg-primary-500 rounded-full items-center justify-center mb-8">
          <Text className="text-white text-5xl font-bold">🚚</Text>
        </View>
        
        <Text className="text-4xl font-bold text-gray-900 text-center mb-4">
          Fast Delivery
        </Text>
        
        <Text className="text-lg text-gray-600 text-center mb-12">
          Get your packages delivered quickly and safely
        </Text>

        {/* Role Selection */}
        <View className="w-full space-y-4">
          <TouchableOpacity
            className="bg-primary-600 py-4 px-8 rounded-xl shadow-lg"
            onPress={() => router.push('/(auth)/customer-login')}
          >
            <Text className="text-white text-center text-lg font-semibold">
              Continue as Customer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-secondary-600 py-4 px-8 rounded-xl shadow-lg"
            onPress={() => router.push('/(auth)/driver-login')}
          >
            <Text className="text-white text-center text-lg font-semibold">
              Continue as Driver
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View className="pb-8 px-6">
        <Text className="text-gray-500 text-center text-sm">
          By continuing, you agree to our Terms & Privacy Policy
        </Text>
      </View>
    </View>
  );
}
