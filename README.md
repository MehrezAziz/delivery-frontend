# Delivery Platform - Mobile App

React Native mobile application for the delivery platform with separate interfaces for Customers and Drivers.

## 🚀 Tech Stack

- **React Native** - Mobile framework
- **Expo** - Development platform
- **Expo Router** - File-based navigation
- **NativeWind** - Tailwind CSS for React Native
- **React Native Paper** - UI component library
- **TypeScript** - Type safety

## 📱 Features

### Customer App
- ✅ Welcome screen with role selection
- ✅ Customer login & registration
- ✅ Home dashboard with quick actions
- ✅ Order creation and management
- ✅ Order tracking
- ✅ Profile management
- ✅ Address management
- ✅ Wallet integration
- ✅ Referral system

### Driver App
- ✅ Driver login & registration
- ✅ Available orders with priority display
- ✅ Order acceptance
- ✅ Active deliveries management
- ✅ Earnings dashboard
- ✅ Performance stats
- ✅ Profile and documents
- ✅ Availability management

## 🎨 UI/UX Design

### Color Scheme
- **Primary (Customer)**: Blue (#0284c7)
- **Secondary (Driver)**: Purple (#c026d3)
- **Success**: Green
- **Warning**: Yellow
- **Error**: Red

### Design Principles
- Clean and modern interface
- Intuitive navigation
- Clear visual hierarchy
- Consistent spacing and typography
- Accessible color contrasts

## 📂 Project Structure

```
delivery-frontend/
├── app/
│   ├── (auth)/              # Authentication screens
│   │   ├── customer-login.tsx
│   │   ├── customer-register.tsx
│   │   ├── driver-login.tsx
│   │   └── driver-register.tsx
│   ├── (customer)/          # Customer app
│   │   ├── home.tsx
│   │   ├── orders.tsx
│   │   └── profile.tsx
│   ├── (driver)/            # Driver app
│   │   ├── home.tsx
│   │   ├── my-orders.tsx
│   │   ├── earnings.tsx
│   │   └── profile.tsx
│   ├── _layout.tsx          # Root layout
│   └── index.tsx            # Welcome screen
├── components/              # Reusable components (to be added)
├── services/                # API services (to be added)
├── utils/                   # Utility functions (to be added)
├── assets/                  # Images, fonts, etc.
└── global.css               # Tailwind styles

```

## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on web
npm run web
```

## 📱 Running the App

### Using Expo Go (Easiest)
1. Install Expo Go app on your phone
2. Run `npm start`
3. Scan the QR code with your phone

### Using Emulator
```bash
# iOS (Mac only)
npm run ios

# Android
npm run android
```

## 🎯 Current Status

### Completed
- ✅ Project setup with Expo and NativeWind
- ✅ Navigation structure with Expo Router
- ✅ Welcome screen
- ✅ Authentication screens (Customer & Driver)
- ✅ Customer app UI (Home, Orders, Profile)
- ✅ Driver app UI (Available Orders, My Orders, Earnings, Profile)
- ✅ Responsive layouts
- ✅ Tab navigation for both apps

### To Do
- [ ] API integration with backend
- [ ] State management (Context API or Redux)
- [ ] Real-time order updates
- [ ] Map integration for addresses
- [ ] Push notifications
- [ ] Image upload for documents
- [ ] Chat functionality
- [ ] Payment integration
- [ ] Offline support
- [ ] Error handling
- [ ] Loading states
- [ ] Form validation
- [ ] Unit tests

## 🔗 API Integration

The app will connect to the backend API at:
- **Development**: `http://localhost:3000`
- **Production**: TBD

### API Endpoints (To be integrated)
- `/auth/user/login` - User authentication
- `/auth/user/register` - User registration
- `/orders` - Order management
- `/driver/orders/available` - Available orders for drivers
- `/customers/me` - Customer profile
- And more...

## 📝 Environment Variables

Create a `.env` file:

```env
API_URL=http://localhost:3000
```

## 🎨 Customization

### Colors
Edit `tailwind.config.js` to customize colors:

```javascript
theme: {
  extend: {
    colors: {
      primary: { ... },
      secondary: { ... },
    },
  },
}
```

### Fonts
Add custom fonts in `assets/fonts/` and load them in `_layout.tsx`

## 📱 Screens Overview

### Welcome Screen
- Role selection (Customer/Driver)
- Clean, welcoming design

### Customer Screens
1. **Home**: Quick actions, active orders, stats
2. **Orders**: Order history and tracking
3. **Profile**: User info, settings, logout

### Driver Screens
1. **Available Orders**: Priority-based order list
2. **My Orders**: Active and completed deliveries
3. **Earnings**: Balance, stats, transactions
4. **Profile**: Driver info, documents, settings

## 🐛 Troubleshooting

### Metro Bundler Issues
```bash
# Clear cache
npm start -- --clear

# Reset Metro
npx expo start -c
```

### NativeWind Not Working
```bash
# Reinstall dependencies
rm -rf node_modules
npm install

# Clear cache
npm start -- --clear
```

### iOS Build Issues
```bash
# Clean iOS build
cd ios && pod install && cd ..
```

## 📚 Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Router](https://expo.github.io/router/)
- [NativeWind](https://www.nativewind.dev/)
- [React Native Paper](https://callstack.github.io/react-native-paper/)

## 🤝 Contributing

1. Follow React Native best practices
2. Use TypeScript for type safety
3. Follow the existing code structure
4. Test on both iOS and Android
5. Update documentation when adding features

## 📄 License

This project is part of the delivery platform system.

---

**Status**: UI/UX Complete - Ready for API Integration
