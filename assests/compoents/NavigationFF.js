import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from '../forms/login';
import SignUp from '../forms/signUp';
import PondDashboard from '../forms/PondDashboard';
import AddPondScreen from '../forms/AddPondScreen';
import FishFarmPlanner from '../forms/FishFarmPlanner';
import StockManagementScreen from '../forms/StockManagementScreen';
import FishSpeciesScreen from '../forms/FishSpeciesScreen';
import FeedingGuideScreen from '../forms/FeedingGuideScreen';
import BudgetExpensesScreen from '../forms/Budget';
import ReportsScreen from '../forms/ReportsScreen';
import Admin from '../forms/Admin';
import WaterCyclingScreen from '../forms/WaterCyclingScreen';
import FertilizationScreen from '../forms/FertilizationScreen';
import InformationScreen from '../forms/InformationScreen';
import MarketplaceScreen from '../forms/MarketplaceScreen';
import LogMortalityScreen from '../forms/LogMortalityScreen';
import HarvestFishScreen from '../forms/HarvestFishScreen';
import WelcomeSetupScreen from '../forms/WelcomeSetupScreen';
import FarmAreaScreen from '../forms/FarmAreaScreen';
import SpeciesSelectionScreen from '../forms/SpeciesSelectionScreen';
import StockingScreen from '../forms/StockingScreen';

import LogDiease from '../forms/LogDieases';

const Stack = createNativeStackNavigator();

export default function NavigationFF() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SignUp"
          component={SignUp}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="LogDiease"
          component={LogDiease}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Dashboard"
          component={PondDashboard}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AddPond"
          component={AddPondScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="LogMortality"
          component={LogMortalityScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="HarvestFish"
          component={HarvestFishScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FarmPlanner"
          component={FishFarmPlanner}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="StockManagement"
          component={StockManagementScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FishSpecies"
          component={FishSpeciesScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FeedGuide"
          component={FeedingGuideScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="WaterQuality"
          component={WaterCyclingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="RecordWaterCycle"
          component={WaterCyclingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Fertilization"
          component={FertilizationScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Info"
          component={InformationScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Marketplace"
          component={MarketplaceScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Admin"
          component={Admin}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="BudgetE"
          component={BudgetExpensesScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Reports"
          component={ReportsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="WelcomeSetup"
          component={WelcomeSetupScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FarmArea"
          component={FarmAreaScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SpeciesSelection"
          component={SpeciesSelectionScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Stocking"
          component={StockingScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
