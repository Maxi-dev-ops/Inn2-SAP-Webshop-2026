import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import UserService from "../model/UserService";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class ProfileController extends BaseController {

    // -- Lifecycle & routing -- //

    public onInit(): void {
        this._attachRoute(Constants.ROUTES.PROFILE, this._onRouteMatched.bind(this));
        // Filled from start_up; empty until the first answer arrives
        this.setModel(new JSONModel({ name: "", initials: "", email: "", userId: "" }), "profileModel");
    }

    // UserService caches the answer, so later entries cost no request
    private _onRouteMatched(): void {
        void UserService.load().then((oUser) => {
            if (!oUser) {return;}
            const oProfile = this._json("profileModel");
            oProfile.setProperty("/name", oUser.fullName);
            oProfile.setProperty("/initials", oUser.initials);
            oProfile.setProperty("/userId", oUser.id);
            if (oUser.email) {oProfile.setProperty("/email", oUser.email);}
            oProfile.refresh(true);
        });
    }
}
