import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class ProfileController extends BaseController {

    public onInit(): void {
        this._attachRoute(Constants.ROUTES.PROFILE, this._onRouteMatched.bind(this));
        this.setModel(new JSONModel(this._buildProfile()), "profileModel");
    }

    private _onRouteMatched(): void {
        // profile data once a backend service is available
    }

    /** Demo data only, requires OData entity set for real data */
    private _buildProfile(): Record<string, string> {
        if (this._isDemoMode()) {
            return {
                name: "Demo User",
                initials: "DU",
                company: "Demo GmbH",
                email: "user@example.com",
                department: "Procurement",
                location: "–",
                userId: "DEMO_USER"
            };
        }
        return {
            name: "–",
            initials: "",
            company: "–",
            email: "–",
            department: "–",
            location: "–",
            userId: "–"
        };
    }
}
