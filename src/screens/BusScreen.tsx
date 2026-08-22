import { useState, useMemo, useEffect } from "react";
import { Search, X, Star, ArrowLeft, Bus as BusIcon, RadioTower, Navigation, Clock, Calendar, ChevronDown } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useBusLocations } from "@/hooks/useBusLocations";
import { useApp } from "@/store/AppContext";
import { fetchAllRoutes, fetchStopsForRoute } from "@/services/routeService";
import { fetchBisTimeInfo, type BisTimeInfo } from "@/api/jeonjuBis";
import type { Route, BusStop } from "@/types/route";
import type { Favorite } from "@/types";
import { LoadingSkeleton, ErrorState, EmptyState } from "@/components/ui";
import { showToast } from "@/components/Toast";
import type { Station } from "@/types/route";
import { MapPin } from "lucide-react";
import { resolveNodeId, resolveRouteId } from "@/services/arrivalService";
import { searchStations, fetchRoutesForStation, type StationRoute } from "@/services/stationService";

// FILE TOO LARGE - will use alternative
