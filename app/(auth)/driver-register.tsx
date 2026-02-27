import { View, Text, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

export default function DriverRegisterScreen() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: '',
    secondName: '',
    phone: '',
    password: '',
    confirmPassword: '',
    vehicleType: '',
  });

  const handleRegister = () => {
    // TODO: Implement registration logic
    console.log('Driver Register:', formData);
    router.replace('/(driver)/home');
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 px-6 pt-16 pb-8">
          {/* Back Button */}
          <TouchableOpacity 
            onPress={() => router.back()}
            className="mb-8"
          >
            <Text className="text-secondary-600 text-lg">← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View className="mb-8">
            <View className="w-20 h-20 bg-secondary-500 rounded-full items-center justify-center mb-6">
              <Text className="text-white text-3xl">🚗</Text>
            </View>
            <Text className="text-4xl font-bold text-gray-900 mb-2">
              Become a Driver
            </Text>
            <Text className="text-lg text-gray-600">
              Start earning by delivering packages
            </Text>
          </View>

          {/* Form */}
          <View className="space-y-4">
            <View>
              <Text className="text-gray-700 font-medium mb-2">First Name</Text>
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-xl px-4 py-4 text-base"
                placeholder="Enter your first name"
                value={formData.firstName}
                onChangeText={(text) => setFormData({...formData, firstName: text})}
              />
            </View>

            <View>
              <Text className="text-gray-700 font-medium mb-2">Last Name</Text>
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-xl px-4 py-4 text-base"
                placeholder="Enter your last name"
                value={formData.secondName}
                onChangeText={(text) => setFormData({...formData, secondName: text})}
              />
            </View>

            <View>
              <Text className="text-gray-700 font-medium mb-2">Phone Number</Text>
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-xl px-4 py-4 text-base"
                placeholder="+216 XX XXX XXX"
                keyboardType="phone-pad"
                value={formData.phone}
                onChangeText={(text) => setFormData({...formData, phone: text})}
              />
            </View>

            <View>
              <Text className="text-gray-700 font-medium mb-2">Vehicle Type</Text>
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-xl px-4 py-4 text-base"
                placeholder="e.g., Motorcycle, Car, Van"
                value={formData.vehicleType}
                onChangeText={(text) => setFormData({...formData, vehicleType: text})}
              />
            </View>

            <View>
              <Text className="text-gray-700 font-medium mb-2">Password</Text>
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-xl px-4 py-4 text-base"
                placeholder="Create a password"
                secureTextEntry
                value={formData.password}
                onChangeText={(text) => setFormData({...formData, password: text})}
              />
            </View>

            <View>
              <Text className="text-gray-700 font-medium mb-2">Confirm Password</Text>
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-xl px-4 py-4 text-base"
                placeholder="Confirm your password"
                secureTextEntry
                value={formData.confirmPassword}
                onChangeText={(text) => setFormData({...formData, confirmPassword: text})}
              />
            </View>

            <TouchableOpacity
              className="bg-secondary-600 py-4 rounded-xl shadow-lg mt-4"
              onPress={handleRegister}
            >
              <Text className="text-white text-center text-lg font-semibold">
                Create Driver Account
              </Text>
            </TouchableOpacity>

            {/* Login Link */}
            <View className="flex-row justify-center items-center mt-6">
              <Text className="text-gray-600">Already a driver? </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text className="text-secondary-600 font-semibold">Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
